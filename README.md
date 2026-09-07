# DLP Analyzer

A collection of browser-based tools for analyzing **Data Loss Prevention (DLP)** data. DLP Analyzer is designed to work with CSV exports from **Forcepoint DLP / Forcepoint Security Manager**, especially incident (alert) exports and policy/rule exports. It is a companion analysis utility, not an official Forcepoint product.

Processing happens in the browser: uploaded CSV contents are not sent to an application server. The three CSV-based tools use one shared Papa Parse integration (`csv-utils.js`), with Web Worker parsing enabled when the browser supports it, so large Forcepoint exports do not unnecessarily block the interface.

## Forcepoint DLP compatibility

DLP Analyzer expects the column names present in Forcepoint DLP exports. In particular:

- **Alert Analyzer** works with incident exports containing fields such as `ID`, `Incident Time`, `Source`, `Policies`, `Destination`, `File Name`, `Details`, `Channel`, `Action`, and `Severity`.
- **Rule Identifier** combines an alert export (including `Violation Triggers` and `Policies`) with a policy/rule export (including `Rule Name`, `Relation`, and `Classifiers`) to add the matching rule name to each alert.
- **Card Manager** runs reusable JavaScript predicates against the same alert CSV rows, which is useful for organization-specific Forcepoint DLP triage rules.

Export labels can vary between Forcepoint versions and configured report templates. If a required column was renamed or omitted, export it again with the expected field names before processing it. All analysis is local and does not modify data in Forcepoint.

## Open the application

Open `docs/DLP_Tools.html` directly in a web browser. No web server, installation, or build step is required.

`DLP_Tools.html` is the main page and provides navigation to every tool. Individual HTML files in `docs/` can also be opened directly when you only need a specific tool.

## Project structure

```text
docs/
├── DLP_Tools.html        # Main page and navigation
├── AlertAnalyzer.html    # DLP alert analysis from CSV files
├── CardManager.html      # JavaScript snippet manager
├── RuleIdentifier.html   # Alert and policy matching
├── PolicyViewer.html     # DLP policy viewer
├── DocViewer.html        # Document viewer
├── KeywordGenerator.html # Keyword generator
├── KG_script.js          # Keyword Generator logic
├── csv-utils.js          # Shared Papa Parse wrapper (worker-enabled)
└── styles.css            # Shared stylesheet for all pages
```

## Page functions

- **DLP Tools** provides a single navigation page that loads each analyzer and utility.
- **Alert Analyzer** imports DLP alert CSV files and presents summaries, rule-based findings, filters, charts, and exports.
- **Card Manager** stores reusable JavaScript filters and runs enabled snippets against uploaded CSV data.
- **Rule Identifier** matches alert classifier data to DLP policy rules and exports the enriched alerts.
- **Policy Viewer** imports policy data and provides searchable, filterable policy and rule details.
- **Document Viewer** opens supported local documents for quick browser-based inspection.
- **Keyword Generator** extracts and ranks useful keywords from supplied text or files.
