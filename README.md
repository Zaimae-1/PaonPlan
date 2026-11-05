# PaonPlan

**Tahu berapa porsi sebelum mulai masak.**

PaonPlan menghubungkan penjualan kasir, stok porsi, Tutup Hari, perkiraan permintaan, dan kebutuhan bahan untuk warung makan kecil di Bali. Proyek ini disiapkan untuk AI Web Innovation Challenge, Bali DigiFest 2026, bidang UMKM & Bisnis.

## Menjalankan di komputer pengembangan

Gunakan Node.js 22.18 atau lebih baru dan npm. PostgreSQL lokal dijalankan sebagai pengguna biasa. Pada Windows, helper menyimpan cluster di `%LOCALAPPDATA%/PaonPlan-dev-postgres`. Data tetap tersimpan setelah server dihentikan.

Terminal pertama:

```sh
npm ci
npm run db:local
```

Biarkan terminal database terbuka. Jika database sudah berjalan, helper hanya memeriksa koneksi lalu selesai. Pada instalasi baru, helper membuat database UTF-8 dan `.env.local` dengan sandi acak. Jika memakai PostgreSQL sendiri, salin `.env.example` menjadi `.env.local`, isi `DATABASE_URL`, dan jalankan server tersebut.

Terminal kedua:

```sh
npm run db:migrate
npm run db:demo
npm run dev
```

Buka [Ruang usaha](http://127.0.0.1:3000/usaha) dan [Pelanggan demo](http://127.0.0.1:3000/warung/demo). Migrasi memakai tabel versi dan kunci transaksi PostgreSQL sehingga dapat dijalankan berulang. Seed demo mempertahankan data dan akun yang sudah ada.

| Peran demo | Email | Sandi |
| --- | --- | --- |
| Admin | admin@paonplan.test | PaonPlanDemo2026! |
| Kasir | kasir@paonplan.test | PaonPlanDemo2026! |

Semua data dalam warung berlabel **Data contoh** bersifat fiktif. Gunakan dua profil atau sesi browser terpisah untuk Admin dan Kasir. Pelanggan membuka halaman publik tanpa akun.

## Tampilan menu dan ikon sementara

Halaman pelanggan menggunakan header gelap, latar krem, aksen terakota, kartu menu, dan kategori yang terinspirasi dari [referensi restoran](https://restoran.ade-setiawan.my.id/). Katalog kasir dan keranjang menggunakan ikon yang sama. Beranda Admin tetap membawa desain **Besok masak berapa?**.

Menu demo mencakup Ayam Betutu, Sate Lilit, Nasi Jinggo, Nasi Campur Bali, Tipat Cantok, Jukut Ares, Loloh Cemcem, dan Kopi Kintamani. Referensi nama kuliner berasal dari [Indonesia Travel tentang kuliner Bali](https://www.indonesia.travel/id/id/destination/bali-nusa-tenggara/bali), [panduan kuliner dan Loloh Cemcem](https://www.indonesia.travel/id/id/travel-ideas/gastronomy/10-iconic-cuisine-s-that-you-must-try-on-your-next-visit-to-bali), serta [Kopi Kintamani](https://www.indonesia.travel/id/id/travel-ideas/gastronomy/kopi-indonesia). Harga, porsi, dan stok awal merupakan data fiktif.

`npm run db:demo` menambahkan pilihan demo yang belum ada ketika dijalankan ulang. Harga, stok, dan catatan menu yang sudah ada dipertahankan. Daftar contoh tersimpan di `src/lib/demo-menus.ts`.

Ikon SVG sementara tersedia di `src/components/operations/menu-art.tsx`. Untuk memakai PNG nanti, simpan berkas di `public/menu/`, lalu isi `menuImages` berdasarkan nama menu huruf kecil. Contohnya `"ayam betutu": "/menu/ayam-betutu.png"`. Gambar yang sama akan muncul pada katalog, keranjang, dan daftar menu Admin. Nama, harga, dan stok tetap dibaca dari database.

## Memasang warung sendiri dan deployment

Siapkan PostgreSQL bersama, lalu atur `DATABASE_URL` di server. Isi `OWNER_EMAIL`, `OWNER_PASSWORD` (minimal 12 karakter), `SHOP_NAME`, dan `SHOP_SLUG` untuk membuat warung serta akun pemilik.

```sh
npm run db:migrate
npm run db:owner
npm run build
npm start
```

Deployment memerlukan runtime Node.js untuk Next.js App Router dan koneksi ke PostgreSQL. Isi `APP_ORIGIN` dengan origin HTTPS publik yang sebenarnya. Cookie sesi memakai HttpOnly, SameSite, dan Secure pada HTTPS. Sesi disimpan sebagai hash di database dengan masa aktif delapan jam. Akun kasir dapat dibuat, diubah sandinya, atau dinonaktifkan dari **Warung & Akun**. Perubahan sandi atau penonaktifan mencabut sesi kasir.

Jalankan seed demo hanya jika memang ingin menyediakan warung demo. Warung nyata dan demo memiliki ID serta data terpisah. Kredensial contoh di atas hanya untuk warung demo. Halaman publik warung sendiri tersedia di `/warung/<SHOP_SLUG>`.

## Alur per peran

### Admin

1. Buka **Menu & Stok** untuk mengatur nama, kategori, harga, ketersediaan, dan visibilitas menu.
2. Tambahkan bahan memakai satuan dasar **g**, **ml**, atau **buah**. Masukkan resep per porsi dan tandai kelengkapannya.
3. Catat pembelian bahan. Aplikasi menambah stok dan membuat satu pengeluaran yang terhubung. Isi ukuran kemasan hanya jika diketahui. Pembelian menyimpan jumlah serta harga yang benar-benar dibayar.
4. Catat batch produksi memakai resep, pemakaian aktual, atau penanda pemakaian bahan belum tercatat. Produksi menambah stok porsi dan mengurangi bahan. Koreksi stok memerlukan alasan.
5. Buka **Tutup Hari**. Tinjau porsi terjual dari transaksi selesai, lalu konfirmasi jumlah disiapkan, status habis sebelum tutup, dan acara. Masukkan saldo awal, kas fisik, serta pergerakan tunai lain jika tersedia.
6. Setelah ditutup, rekap **Kasir · Tutup Hari** masuk ke data model. Buka **Rencana Porsi**, hitung, tinjau alasan, pilih jumlah produksi, lalu simpan. Kebutuhan bahan untuk besok mengikuti jumlah pilihan pemilik.
7. Gunakan **Buat catatan penutupan** setelah menutup hari. Catatan mengarahkan pemilik ke laporan dan kebutuhan bahan sumbernya.
8. Buka **Penjualan** untuk periode laporan, transaksi asal, pembatalan, pengeluaran, persentase gaji aktual terhadap penjualan sebelum pajak, target dana, dan unduhan PDF.

Tutup Hari mengunci transaksi dan produksi pada tanggal tersebut. **Buka kembali rekap** memerlukan alasan, melepas rekap kasir tanggal itu dari model, dan memungkinkan koreksi sebelum ditutup kembali. Angka rencana yang sudah disimpan tetap bisa dilihat. Jika demo lokal sudah dipakai untuk pengujian, buka kembali hari yang ditutup sebelum mencoba transaksi baru.

Jumlah awal porsi disiapkan pada formulir berasal dari batch hari itu atau jumlah terjual. Pemilik perlu mengonfirmasi jumlah sebenarnya, termasuk porsi dari stok sebelumnya. Menu nol penjualan hanya masuk sebagai observasi jika dipilih untuk direkap. Jumlah sisa rekap adalah disiapkan dikurangi terjual. Stok siap jual dan alokasi pesanan tetap dikelola terpisah.

Untuk penjualan sebelum memakai kasir, buka **Rencana Porsi → Masukkan atau koreksi riwayat manual**. Satu menu dan tanggal memiliki satu rekap. Tanggal dengan transaksi kasir memakai alur Tutup Hari. Riwayat manual pada tanggal yang sudah memakai kasir ditolak.

### Kasir

- Cari menu atau saring kategori, lalu ketuk menu dan sesuaikan jumlah di keranjang.
- **Tunai** memerlukan uang diterima yang cukup dan menampilkan kembalian sebelum diselesaikan.
- **QRIS** memerlukan pemeriksaan pada aplikasi merchant. Tombol **Konfirmasi pembayaran QRIS** mencatat konfirmasi manual kasir.
- Buka **Struk saya** untuk menemukan dan mencetak ulang transaksi milik akun kasir tersebut.
- Dari antrean pesanan, terima dan alokasikan porsi, mulai siapkan, tandai siap diambil, lalu catat pembayaran saat pelanggan mengambil.
- Jika jawaban jaringan terputus, ulangi dengan isian yang sama. Kode operasi mengembalikan hasil transaksi yang sudah tersimpan. Periksa riwayat sebelum membuat pembayaran baru dengan isian berbeda.

Harga, nama menu, nama warung, dan tarif pajak disalin ke transaksi. Perubahan harga berikutnya mempertahankan isi struk lama. Nilai rupiah memakai bilangan bulat. Pajak dibulatkan sekali dari subtotal × tarif, ke rupiah terdekat.

Admin dapat membatalkan transaksi selesai dengan alasan. Cocokkan pengembalian uang di kas atau aplikasi merchant sebelum mencatat pembatalan. Pilih apakah porsi masih bisa dijual kembali. Pembatalan mengeluarkan transaksi dari penjualan bersih dan mengembalikan stok hanya jika porsi dinyatakan layak jual.

### Pelanggan

- Buka **Pesan makanan**, isi jumlah, nama, kontak, dan jadwal WITA. Pembayaran dilakukan saat pengambilan.
- Pesanan awal berstatus **Menunggu konfirmasi**. Stok dialokasikan secara atomik ketika staf menerimanya. Pembatalan sebelum selesai melepaskan alokasi. Penyelesaian mencatat pembayaran tanpa memotong porsi dua kali.
- Pilih **Booking meja** untuk permintaan terpisah dengan slot 30 menit. Kapasitas divalidasi lagi ketika Admin mengonfirmasi. Booking mempunyai status sendiri dan tidak mengubah stok porsi.
- Simpan kode atau tautan status. Referensi acak 144-bit membuka satu permintaan dan tidak menampilkan nama atau kontak pelanggan di halaman status.
- Pesanan bisa diajukan untuk hari ini atau besok. Booking tersedia sampai 30 hari ke depan. Sistem menolak jadwal yang sudah lewat.

## Perkiraan porsi dan catatan penutupan

Model inti memakai regresi ridge tanpa API key, dengan indikator hari, akhir pekan, dan rata-rata hingga tujuh catatan terdahulu yang diskalakan per lima porsi. Penalti L2 bernilai 1 dengan intersep bebas penalti.

- **Kurang dari 3 hari teramati** menampilkan data belum cukup.
- **Mulai 3 hari teramati**, pembanding memakai median hingga tujuh catatan hari sejenis (hari kerja atau akhir pekan) jika tersedia minimal tiga. Jika kurang, dipakai hingga tujuh catatan valid terbaru.
- **Mulai 20 hari teramati**, enam tanggal terakhir diuji secara berjalan. Tanggal uji pertama mempunyai minimal 14 catatan terdahulu. Tiga catatan pertama membentuk fitur historis. Setiap prediksi hanya membaca data sebelum tanggal target.
- Model dipilih jika rata-rata selisih mutlak (MAE) lebih rendah daripada median pada tanggal uji yang sama. Jika kalah atau seri, aplikasi memakai **Perkiraan awal**.
- Penanda acara masuk ke model jika data fit memiliki minimal empat hari acara dan empat hari tanpa acara.
- Kisaran berasal dari persentil ke-80 galat absolut metode terpilih pada enam tanggal uji. Permintaan dapat berada di luar kisaran.
- Hari habis sebelum tutup dipisahkan dari label, median, fitur rata-rata, dan evaluasi karena penjualan hanya menunjukkan batas bawah permintaan. Nol yang sengaja dicatat tetap dihitung. Hari tanpa catatan dilewati.

Endpoint lama `POST /api/perkiraan` tetap tersedia untuk data browser. Ruang usaha memakai modul model yang sama dengan riwayat dari PostgreSQL. Saat rencana disimpan, server memeriksa ulang versi angka yang dilihat pemilik. Rencana menyimpan pilihan produksi beserta salinan hasil, versi model, dan waktu penyimpanan.

**Ringkasan dari catatan usaha** memakai angka yang dihitung aplikasi. Jika `SUMMARY_AI_URL`, `SUMMARY_AI_KEY`, dan `SUMMARY_AI_MODEL` diisi, server dapat mengirim ringkasan angka ke endpoint chat-completions yang kompatibel. Nama dan kontak pelanggan tidak dikirim. Jika konfigurasi tidak lengkap atau layanan gagal, ringkasan aturan tetap tersedia. Jalur layanan AI eksternal belum diuji dengan kredensial nyata.

## Stok, pembelian, dan kas

Semua mutasi operasional mengunci baris warung di dalam transaksi PostgreSQL. Checkout, pembayaran, dan perubahan stok dikomit bersama. Kode operasi mencegah penulisan ulang saat percobaan yang sama dikirim kembali. Penerimaan pesanan dan konfirmasi booking memakai penguncian yang sama untuk mencegah stok negatif atau kapasitas terlampaui.

Stok porsi dan bahan memakai buku pergerakan terpisah. Penjualan hanya mengurangi porsi. Pemakaian bahan dicatat saat produksi. Batch tanpa pemakaian tetap berlabel belum tercatat saat produksi dan tercermin dalam catatan penutupan.

Kebutuhan bahan berasal dari resep × jumlah rencana, dikurangi stok bahan. Harga rujukan berasal dari pembelian terakhir. Biaya perkiraan kebutuhan dan estimasi belanja kemasan ditampilkan terpisah. Resep parsial serta harga yang belum ada diberi penjelasan.

Laporan membedakan penjualan sebelum pajak, pajak, pembayaran tunai dan QRIS, serta pengeluaran tercatat. Selisih kas fisik memerlukan saldo awal dan kas yang benar-benar dihitung. Selisih kas operasional menggunakan penerimaan termasuk pajak dikurangi pengeluaran yang dicatat. Harga pokok makanan terjual belum dihitung dalam versi ini.

## Data browser versi awal

Alamat utama `/` mengarah ke `/usaha`. Setelah masuk, Admin membuka ringkasan dengan desain **Besok masak berapa?**, rencana besok, penjualan terakhir, dan data operasional bersama. Kasir diarahkan ke layar kasir.

Arsip versi awal tersedia di `/data-browser` dan dapat dibuka dari **Warung & Akun → Pulihkan data browser versi awal** atau tautan pemulihan pada halaman masuk. Arsip, `/rencana`, `/penjualan/catat`, dan `/riwayat` membaca data lokal dengan kunci yang sama. Pilih **Ekspor data browser** untuk mengunduh catatan, menu, dan rencana sebagai JSON.

Pemindahan otomatis ke PostgreSQL belum tersedia. Ekspor dahulu dari perangkat, browser, dan alamat situs yang menyimpan data tersebut. Kemudian masukkan menu dan riwayat yang diperlukan melalui formulir riwayat manual di ruang usaha. Data contoh browser dan data usaha browser tetap terpisah. Membuka alamat berbeda, misalnya localhost dan 127.0.0.1, menggunakan penyimpanan browser yang berbeda.

## Verifikasi

```sh
npm test
npm run test:integration
npm run lint
npm run typecheck
npm run build
```

Untuk tes integrasi, server aplikasi dan database perlu berjalan. `TEST_ORIGIN` dapat mengganti origin pengujian. Tes membuat warung fiktif tersendiri, menggunakan endpoint HTTP normal, lalu membersihkan data warung uji tersebut. Tes mencakup akses antarperan dan warung, uang tunai kurang, QRIS belum dikonfirmasi, percobaan checkout serentak, porsi terakhir, produksi dan pembelian berulang, snapshot struk, alokasi dan penyelesaian pesanan, kapasitas booking, rekap kasir ke model, pembatalan, perhitungan restok, dan PDF banyak transaksi.

Tes pemenuhan pesanan mensimulasikan tibanya hari pengambilan pada data warung uji. Delapan tes model versi awal tetap dijalankan.

Bukti dari browser tersedia untuk Admin, Kasir, Rencana Porsi, Tutup Hari, dan pelanggan. Desktop diuji pada 1440 px, kasir tablet pada 1024 px, serta layar 360 px dengan teks 200%. Navigasi keyboard, fokus, dan alur lintas sesi juga diperiksa.

| Bukti | Berkas |
| --- | --- |
| Beranda Admin | [Desktop](output/playwright/admin-ringkasan.png) · [HP 360 px](output/playwright/admin-ringkasan-360.png) |
| Kasir tablet | [Screenshot](output/playwright/kasir-tablet.png) |
| Rencana Porsi bersama | [Screenshot](output/playwright/rencana-usaha.png) |
| Tutup Hari | [Screenshot](output/playwright/tutup-hari.png) |
| Pelanggan desktop | [Screenshot](output/playwright/pelanggan-desktop.png) |
| Katalog pelanggan | [Screenshot](output/playwright/menu-pelanggan.png) |
| Pelanggan 360 px | [Screenshot](output/playwright/pelanggan-360.png) |
| Laporan banyak transaksi fiktif | [PDF](output/pdf/laporan-verifikasi.pdf) |
| Pratinjau struk 58 mm | [PDF](output/pdf/struk-58mm.pdf) |
| Pratinjau struk 80 mm | [PDF](output/pdf/struk-80mm.pdf) |

## Batas verifikasi

Seluruh hasil pengujian memakai data fiktif. Validasi lapangan dengan pemilik warung masih diperlukan. QRIS diverifikasi manual oleh kasir. Pembatalan mencatat hasil pengembalian dana yang dikonfirmasi staf. Struk diuji melalui keluaran cetak PDF Chromium pada 58 mm dan 80 mm; printer fisik belum diuji. Layanan AI ringkasan eksternal serta URL hosting publik belum dikonfigurasi dan diverifikasi. Untuk submission publik, jalankan migrasi di database deployment lalu uji halaman pelanggan dari sesi tanpa login.
