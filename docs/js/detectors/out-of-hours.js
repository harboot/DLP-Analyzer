(function (registry) {
  'use strict';
  function timeToMinutes(value, fallback) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '')); if (!match) return fallback;
    const hours = Number(match[1]); const minutes = Number(match[2]);
    return hours < 24 && minutes < 60 ? (hours * 60) + minutes : fallback;
  }
  registry.register({
    id: 'builtin-out-of-hours', key: 'outOfHours', name: 'Out-of-Hours',
    description: 'Matches alerts whose incident time falls within the configured monitoring window.', weight: 5,
    settings: { startTime: '23:00', endTime: '05:00' }, settingFields: [{ key: 'startTime', label: 'Start time', type: 'time' }, { key: 'endTime', label: 'End time', type: 'time' }],
    match(row, settings) {
      const cleaned = String(row.IncidentTime || '').replace(/([A-Z][a-z]{2})\./g, '$1').split(' GMT')[0];
      const date = new Date(cleaned); const minutes = Number.isNaN(date.getTime()) ? null : (date.getHours() * 60) + date.getMinutes();
      const start = timeToMinutes(settings.startTime, 23 * 60); const end = timeToMinutes(settings.endTime, 5 * 60);
      return minutes !== null && (start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end);
    }
  });
})(RiskDetectors);
