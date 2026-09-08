# Browser libraries

Place the SheetJS browser bundle at `xlsx.full.min.js` in this directory. The Alert Analyzer loads it with:

```html
<script src="lib/xlsx.full.min.js"></script>
```

The expected bundle is `xlsx.full.min.js` from SheetJS Community Edition 0.18.5. It is only required when importing XLSX files; CSV imports continue to use Papa Parse.
