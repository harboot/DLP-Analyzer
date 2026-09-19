(function (registry) {
  'use strict';
  function timeToMinutes(value, fallback) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '')); if (!match) return fallback;
    const hours = Number(match[1]); const minutes = Number(match[2]);
    return hours < 24 && minutes < 60 ? (hours * 60) + minutes : fallback;
  }
  function incidentParts(value) {
    const text = String(value || '').replace(/([A-Z][a-z]{2})\./g, '$1');
    const clock = /\b(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?\b/i.exec(text);
    if (!clock) return null;
    let hours = Number(clock[1]); const minutes = Number(clock[2]);
    if (minutes > 59 || (clock[3] && (hours < 1 || hours > 12)) || (!clock[3] && hours > 23)) return null;
    if (clock[3]) hours = (hours % 12) + (clock[3].toUpperCase() === 'PM' ? 12 : 0);
    const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const namedDate = /\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})\b/.exec(text);
    const numericDate = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text);
    let day = null;
    if (namedDate) {
      const month = monthNames.indexOf(namedDate[2].slice(0, 3).toLowerCase());
      if (month !== -1) day = new Date(Date.UTC(Number(namedDate[3]), month, Number(namedDate[1]))).getUTCDay();
    } else if (numericDate) {
      day = new Date(Date.UTC(Number(numericDate[1]), Number(numericDate[2]) - 1, Number(numericDate[3]))).getUTCDay();
    }
    return { minutes: (hours * 60) + minutes, day };
  }
  registry.register({
    id: 'builtin-out-of-hours', key: 'outOfHours', name: 'Out-of-Hours',
    description: 'Matches alerts whose incident time falls within the configured monitoring window.', weight: 5,
    settings: { startTime: '23:00', endTime: '05:00', includeWeekend: true }, settingFields: [{ key: 'startTime', label: 'Start time', type: 'time' }, { key: 'endTime', label: 'End time', type: 'time' }, { key: 'includeWeekend', label: 'Include weekends', type: 'checkbox' }],
    match(row, settings) {
      const incident = incidentParts(row.IncidentTime);
      if (!incident || (settings.includeWeekend === false && (incident.day === null || incident.day === 0 || incident.day === 6))) return false;
      const minutes = incident.minutes;
      const start = timeToMinutes(settings.startTime, 23 * 60); const end = timeToMinutes(settings.endTime, 5 * 60);
      return start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
    }
  });
})(RiskDetectors);
