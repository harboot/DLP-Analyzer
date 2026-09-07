# DLP Analyzer

A collection of browser-based tools for analyzing **Data Loss Prevention (DLP)** data. The application runs entirely on the client side and does not require a build step.

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
