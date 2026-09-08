# DLP Analyzer

A collection of browser-based tools for analyzing **Data Loss Prevention (DLP)** data. DLP Analyzer is designed to work with CSV exports from **Forcepoint DLP / Forcepoint Security Manager**, especially incident (alert) exports and policy/rule exports. The Alert Analyzer also accepts XLSX incident exports directly. It is a companion analysis utility, not an official Forcepoint product.

Processing happens in the browser: uploaded file contents are not sent to an application server. The CSV-based tools use one shared Papa Parse integration (`docs/js/csv-utils.js`), with Web Worker parsing enabled when the browser supports it, so large Forcepoint exports do not unnecessarily block the interface. XLSX files are read locally with a local SheetJS browser build (`docs/lib/xlsx.full.min.js`).

## Forcepoint DLP compatibility

DLP Analyzer expects the column names present in Forcepoint DLP exports. In particular:

- **Alert Analyzer** works with incident exports containing fields such as `ID`, `Incident Time`, `Source`, `Policies`, `Destination`, `File Name`, `Details`, `Channel`, `Action`, and `Severity`.
- **Rule Identifier** combines an alert export (including `Violation Triggers` and `Policies`) with a policy/rule export (including `Rule Name`, `Relation`, and `Classifiers`) to add the matching rule name to each alert.
- **Custom Rule** creates, stores, imports, exports, and runs reusable JavaScript predicates against the same alert CSV rows, which is useful for organization-specific Forcepoint DLP triage rules.

Export labels can vary between Forcepoint versions and configured report templates. If a required column was renamed or omitted, export it again with the expected field names before processing it. All analysis is local and does not modify data in Forcepoint.

## Open the application

To try Alert Analyzer immediately, open the [hosted GitHub Pages version](https://harboot.github.io/DLP-Analyzer/DLP_Tools.html#AlertAnalyzer).

Open `docs/DLP_Tools.html` directly in a web browser. No web server, installation, or build step is required.

`DLP_Tools.html` is the main page and provides navigation to every tool. Individual HTML files in `docs/` can also be opened directly when you only need a specific tool.

## Project structure

```text
.
├── AGENTS.md                    # Repository language and workflow guidance
├── README.md                    # Project documentation
└── docs/
    ├── DLP_Tools.html           # Main page and tool navigation
    ├── AlertAnalyzer.html       # DLP alert analysis interface
    ├── CardManager.html         # Custom Rule interface
    ├── RuleIdentifier.html      # Alert and policy matching interface
    ├── PolicyViewer.html        # DLP policy viewer
    ├── DocViewer.html           # Local document viewer
    ├── KeywordGenerator.html    # Keyword generator interface
    ├── styles.css               # Shared application styles
    ├── js/                      # Shared and page-specific browser logic
    │   ├── KG_script.js         # Keyword Generator logic
    │   ├── ai.js                # AI-assisted filter generation
    │   ├── csv.js               # Alert ingestion and tab construction
    │   ├── csv-utils.js         # Shared Papa Parse wrapper
    │   ├── dlp-utils.js         # Shared DOM and output-safety helpers
    │   ├── rules.js             # Alert Analyzer rule execution
    │   ├── storage.js           # Expiring secrets and rule-result cache
    │   ├── ui.js                # Alert Analyzer rendering and interaction
    │   └── utils.js             # Alert Analyzer data helpers and state
    ├── worker/                  # CPU-intensive background processing
    │   ├── AlertAnalyzer.worker.js
    │   └── RuleIdentifier.worker.js
    └── rules/                   # Declarative JSON risk-rule packs
        ├── destination-risk.json
        ├── filename-risk.json
        ├── suspicious-email.json
        └── volume-risk.json
```

## Shared browser utilities

Pages should load `js/dlp-utils.js` before their page-specific script and reuse the
frozen `DLPUtils` namespace instead of defining equivalent helpers again. The
namespace currently provides `query`, `queryAll`, `toText`, `escapeHtml`, and
`sanitizeForTSV`. Keeping these small, general-purpose helpers shared ensures
that selectors and output escaping behave consistently across the tools;
page-specific parsing and rendering logic should remain in each tool's script.

## Page functions

- **DLP Analyzer** provides a single navigation page that loads each analyzer and utility.
- **Alert Analyzer** imports DLP alert CSV or XLSX files, groups user activity by source, channel, and normalized destination into sessions separated by a 10-minute sliding gap, and presents summaries, original-alert details, JSON rule-pack findings, filters, charts, and exports. For XLSX workbooks, the first worksheet is imported. Rule packs live in `docs/rules/` and can be extended without changing the analyzer HTML.
- **Custom Rule** generates JavaScript predicates with optional OpenAI assistance, stores reusable rules, imports or exports rule collections, and runs enabled rules against uploaded CSV data.
- **Rule Identifier** matches alert classifier data to DLP policy rules and exports the enriched alerts.
- **Policy Viewer** imports policy data and provides searchable, filterable policy and rule details.
- **Document Viewer** opens supported local documents for quick browser-based inspection.
- **Keyword Generator** extracts and ranks useful keywords from supplied text or files.
