# PaonPlan

**Tahu berapa porsi sebelum mulai masak.**

PaonPlan membantu pemilik warung makan di Bali memperkirakan permintaan, memilih jumlah porsi yang ingin disiapkan, dan membandingkan rencana dengan penjualan. MVP ini disiapkan untuk AI Web Innovation Challenge, Bali DigiFest 2026, bidang UMKM & Bisnis.

## Menjalankan aplikasi

Gunakan Node.js 22.18 atau lebih baru dan npm.

```sh
npm ci
npm run dev
```

Buka [PaonPlan lokal](http://localhost:3000). Aplikasi memakai Next.js App Router, TypeScript, dan Tailwind CSS. Prakiraan berjalan di server melalui `POST /api/perkiraan` tanpa API key. Untuk menjalankan hasil build gunakan `npm run build` lalu `npm start`. Hosting perlu mendukung server Next.js agar endpoint prakiraan tersedia.

## Demo lomba

1. Di **Beranda**, pilih **Coba data contoh**. Data fiktif disimpan terpisah dari data warung dan dibuat relatif terhadap tanggal WITA saat demo pertama kali dibuka.
2. Buka **Rencana Porsi**. Pilih **Nasi Ayam**, biarkan tanggal besok, lalu pilih **Hitung perkiraan**. Tinjau jumlah, kisaran, alasan, dan hari kehabisan stok.
3. Ubah jumlah yang akan disiapkan dan simpan. Beranda menampilkan jumlah pilihan Anda. Buka rencana yang tersimpan untuk melihat kembali angka perkiraan yang menyertainya.
4. Pilih **Catat hasil penjualan** dari rencana tersimpan, atau pilih tanggal besok di **Catat Penjualan**. Mode contoh mengizinkan besok untuk simulasi. Masukkan jumlah disiapkan, terjual, dan apakah menu habis sebelum tutup.
5. Buka **Riwayat**. Bandingkan rencana, porsi disiapkan, terjual, dan sisa. Gunakan **Koreksi** untuk memperbarui catatan yang sama. Muat ulang untuk memeriksa bahwa catatan dan rencana tetap tersimpan.
6. Di **Rencana Porsi**, coba **Nasi Jinggo · Data minim** (2 hari teramati) dan **Sate Lilit · Selalu habis** (8 hari kehabisan stok). Kedua skenario menjelaskan mengapa belum ada perkiraan. Untuk mencoba perubahan riwayat, koreksi beberapa penjualan Nasi Ayam dari tanggal sebelum target, lalu hitung ulang.
7. Pilih **Kembali ke data warung** untuk memakai ruang kerja sendiri. Dari **Catat Penjualan**, masukkan nama menu pertama, pilih **Tambah**, lalu isi catatan.

| Layar | Bukti tampilan |
| --- | --- |
| Beranda | [Desktop](output/playwright/beranda.png) |
| Rencana Porsi | [Desktop](output/playwright/rencana-porsi.png) |
| Catat Penjualan | [Desktop](output/playwright/catat-penjualan.png) |
| Riwayat | [Desktop](output/playwright/riwayat.png) · [HP 360 px](output/playwright/riwayat-360.png) |

## Cara AI membantu memilih porsi

Model regresi ridge mempelajari jumlah terjual untuk satu menu dari catatan sebelum tanggal target. Fit memakai indikator hari dalam minggu, akhir pekan, dan rata-rata hingga 7 catatan teramati sebelumnya yang diskalakan per 5 porsi. Penalti L2 bernilai 1 dengan intersep bebas penalti. Penanda acara masuk sebagai fitur jika data fit memiliki setidaknya 4 hari dengan acara dan 4 hari tanpa acara. Jumlah yang dihasilkan dibulatkan ke bilangan bulat pada rentang input yang didukung (0–100.000 porsi).

- **Kurang dari 3 hari teramati.** Aplikasi meminta lebih banyak catatan.
- **Mulai 3 hari teramati.** Perkiraan awal memakai median dari hingga 7 catatan terbaru pada kelompok hari yang sama (hari kerja atau akhir pekan), jika tersedia setidaknya 3. Jika kurang, median memakai hingga 7 catatan teramati terbaru dari semua hari.
- **Mulai 20 hari teramati.** Aplikasi menguji 6 tanggal teramati terakhir secara berurutan. Untuk tanggal uji pertama tersedia minimal 14 catatan terdahulu. Tiga catatan pertama menyiapkan fitur historis. Di setiap langkah, model dan median hanya membaca catatan sebelum tanggal uji. Model dipilih bila MAE (rata-rata selisih mutlak dalam porsi) lebih rendah. Jika sama atau lebih tinggi, median dipilih.
- **Kisaran.** Bila 6 hasil uji tersedia, kisaran memakai persentil ke-80 galat absolut metode terpilih. Dengan sampel kecil ini kisaran hanya panduan historis. Permintaan bisa berada di luarnya.

Penjualan pada hari yang kehabisan stok sebelum tutup menunjukkan batas bawah permintaan. Hari tersebut dipisahkan dari label pelatihan, perhitungan rata-rata penjualan, median, dan evaluasi. Hari tanpa catatan dilewati. Angka nol yang sengaja dicatat tetap masuk sebagai observasi.

Aplikasi menyimpan jumlah pilihan pemilik dan salinan perkiraan beserta versi model, tanggal, menu, penanda acara, dan waktu penyimpanan. Perubahan penjualan sesudahnya memengaruhi perhitungan baru. Rencana yang sudah tersimpan dapat ditinjau kembali melalui Riwayat.

## Pemeriksaan dan batasan

```sh
npm test
npm run lint
npm run typecheck
npm run build
```

Tes mencakup batas jumlah data, WITA, nol penjualan, hari tanpa catatan, stok habis, pemisahan per menu, evaluasi berurutan, serta pengaruh perubahan riwayat. Pada data fiktif Nasi Ayam untuk target **6 November 2026**, perkiraan model 44 porsi dengan kisaran 41–47. MAE model 2,3 porsi dan median 4,8 porsi pada 6 hari uji. Angka ini berasal dari data contoh. Validasi dengan warung sungguhan masih diperlukan.

Data usaha tersimpan di browser pada perangkat dan alamat aplikasi yang sama. Penghapusan data situs dapat menghapus riwayat. Saat **Hitung perkiraan** dipilih, catatan menu yang dipilih sebelum tanggal target dikirim ke server aplikasi untuk dihitung pada permintaan tersebut. Aplikasi tidak menyimpan riwayat di server. Gunakan HTTPS saat menerbitkan versi publik. Semua tanggal operasional mengikuti WITA. Format visual kontrol pemilih tanggal bawaan mengikuti setelan browser.

Untuk submission yang membutuhkan tautan publik, jalankan build ini di hosting Next.js dan buka URL hasil deployment dari sesi tanpa login untuk mencoba alur demo.
