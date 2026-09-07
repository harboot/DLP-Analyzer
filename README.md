# DLP Analyzer

Kumpulan alat berbasis browser untuk membantu analisis data **Data Loss Prevention (DLP)**. Aplikasi berjalan sepenuhnya di sisi klien dan tidak memerlukan proses build.

## Menjalankan aplikasi

1. Jalankan web server dari direktori repositori:

   ```bash
   python3 -m http.server 8000
   ```

2. Buka `http://localhost:8000/code/DLP_Tools.html`.

`DLP_Tools.html` adalah halaman utama dan menyediakan navigasi ke seluruh alat. Membuka berkas HTML lain secara langsung tetap didukung, tetapi penggunaan melalui halaman utama direkomendasikan.

## Struktur proyek

```text
code/
├── DLP_Tools.html        # Halaman utama dan navigasi
├── AlertAnalyzer.html    # Analisis alert DLP dari CSV
├── CardManager.html      # Pengelola snippet JavaScript
├── RuleIdentifier.html   # Pencocokan alert dan policy
├── PolicyViewer.html     # Penampil policy DLP
├── DocViewer.html        # Penampil dokumen
├── KeywordGenerator.html # Generator keyword
├── KG_script.js          # Logika Keyword Generator
└── styles.css            # Satu stylesheet bersama untuk semua halaman
```

## Catatan pengembangan

- Seluruh halaman merujuk ke `code/styles.css` agar tema, tipografi, komponen, dan perilaku responsif konsisten.
- CSS khusus setiap alat diberi scope berdasarkan class halaman agar aturan tidak saling memengaruhi.
- Dependensi eksternal yang digunakan halaman tertentu dimuat langsung dari CDN. Karena itu, koneksi internet mungkin diperlukan untuk fitur tersebut.
- Perubahan tampilan sebaiknya dilakukan di `code/styles.css`; jangan menambahkan stylesheet inline baru.
