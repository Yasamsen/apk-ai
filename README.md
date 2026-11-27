# Web2APK Gratis — starter project

> Developer: **Yasam** · WhatsApp: [+62 815-1998-6005](https://wa.me/6281519986005)

Starter gratis untuk membuat APK Android WebView dari HP menggunakan:
- Frontend statis di Vercel
- GitHub Actions sebagai build worker
- Android WebView native + Gradle
- APK debug yang dapat dipasang untuk pengujian (min Android 5.0/API 21; target Android 10/API 29)

## Penting
Ini adalah starter/MVP, bukan layanan publik siap skala besar. GitHub Actions memiliki kuota dan artefak build memiliki masa kedaluwarsa. Pengguna harus dapat mengakses repository/Actions artifacts untuk mengambil APK. Jangan mengaktifkan layanan publik tanpa rate limiting dan perlindungan penyalahgunaan.

## Pasang dari HP Android
1. Buat akun GitHub dan buat repository baru (misalnya `web2apk-gratis`).
2. Upload seluruh isi folder ZIP ini ke repository, termasuk folder `.github` dan `api`.
3. Di GitHub, buka **Settings → Actions → General**, pastikan workflow diizinkan berjalan.
4. Buat Personal Access Token (fine-grained) yang hanya punya akses ke repository tersebut dengan permission **Actions: Read and write**. Simpan rahasia token, jangan pernah masukkan ke file frontend.
5. Di Vercel, import repository ini sebagai project.
6. Tambahkan Environment Variables di Vercel:
   - `GH_TOKEN` = token GitHub tadi
   - `GH_OWNER` = username pemilik repository
   - `GH_REPO` = nama repository
7. Deploy / redeploy Vercel.
8. Buka website Vercel, isi URL HTTPS, nama aplikasi, dan package ID. Tekan **Mulai Build**.
9. Tunggu sampai indikator progres di website menunjukkan **Siap**, lalu ketuk **Download APK**. File yang terunduh langsung berupa `.apk` (tanpa ZIP) dan bisa langsung dipasang.

## Batasan versi awal
- Hasilnya adalah debug APK untuk pengujian, bukan rilis Play Store.
- Ikon kustom didukung melalui unggah PNG/JPG atau URL HTTPS PNG/JPG. Gambar diperkecil dan dibuatkan aset launcher untuk semua density Android. Tanpa ikon kustom, ikon bawaan tetap digunakan.
- Splash screen, upload/download dalam WebView, push notification, dan penandatanganan rilis belum disediakan.
- Situs target harus mengizinkan pemuatan di WebView. Beberapa website memblokir iframe bukan masalah di sini, tetapi bisa membatasi login, pembayaran, atau fitur browser.
- Build dijalankan di GitHub Actions; Vercel hanya mengirim permintaan. Tidak membundel Android SDK di Vercel.
- Sebelum dibuka ke publik, tambahkan CAPTCHA/rate limit dan aturan pemakaian yang jelas. Jangan membiarkan orang memakai layanan untuk membangun aplikasi yang menyamar atau melanggar hak pemilik situs.

## Troubleshooting
- `workflow_dispatch` tidak muncul: pastikan file `.github/workflows/build-apk.yml` sudah berada di branch default.
- 401/403: periksa `GH_TOKEN` dan permission Actions: Read and write.
- Build gagal: buka log run di GitHub Actions untuk melihat pesan error.


## Jika APK terunduh tetapi tidak bisa dipasang di Android 10
1. Pastikan file yang dipasang berekstensi `.apk`. Website sekarang mengirim APK langsung, jadi tidak perlu ekstrak ZIP lagi.
2. Jika pernah memasang build lama dengan package ID yang sama, hapus aplikasi lama lalu pasang APK baru. APK debug dari build GitHub berbeda dapat ditandatangani dengan kunci debug berbeda sehingga pembaruan langsung ditolak.
3. Buka Pengaturan Android → Aplikasi/Keamanan → Izinkan instalasi aplikasi tidak dikenal untuk aplikasi yang dipakai membuka APK (misalnya Files/Chrome). Nama menu berbeda antarperangkat.
4. Workflow saat ini memakai `minSdk 21` (Android 5.0+) dan `targetSdk 29` (Android 10), serta `compileSdk 35`. Jika tetap gagal, catat pesan lengkap dari pemasang paket atau periksa apakah APK benar-benar selesai diunduh dan diekstrak.


## Ikon aplikasi kustom
- Unggah file PNG/JPG di formulir, atau masukkan URL HTTPS gambar. Jika keduanya diisi, file upload yang dipakai.
- Workflow membuat PNG ikon untuk setiap kepadatan Android dan menghapus ikon vektor bawaan agar tidak menimpa ikon kustom.
- Setelah mengganti workflow di GitHub, jalankan build baru. APK yang sudah terunduh sebelumnya tidak berubah.
- Jika ikon lama masih terlihat di launcher, uninstall APK lama lalu pasang APK baru; beberapa launcher menyimpan cache ikon.


## Halaman offline dan privasi domain

Build ini menampilkan halaman offline buatan sendiri ketika halaman utama gagal dimuat, sehingga URL tidak ditampilkan pada halaman error bawaan WebView. Ini hanya menyembunyikan URL dari layar error; ini **tidak** menghapus domain tujuan dari APK. Untuk aplikasi WebView yang langsung membuka website, domain dapat ditemukan lewat dekompilasi APK atau pemantauan koneksi jaringan. Jangan menganggap domain rahasia hanya karena tidak terlihat di layar.

Untuk mengurangi risiko DDoS: aktifkan proteksi DDoS/WAF dan rate limiting pada penyedia hosting/CDN, gunakan autentikasi dan pembatasan pada endpoint API, jangan menaruh token rahasia di APK, dan siapkan cadangan/monitoring. Jika perlu menyembunyikan alamat server asal, konfigurasi CDN/proxy dengan benar; pengguna tetap dapat melihat domain publik yang diakses aplikasi.


## Asisten AI melayang (GPT)

Jika kotak **Tambahkan asisten AI melayang** dicentang saat build, APK menampilkan tombol bulat **AI** di atas website:
- Bisa digeser ke mana saja dan otomatis menempel ke sisi kiri/kanan layar.
- Ketuk untuk membuka kolom tanya jawab; ketuk ✕ atau tombol Back untuk menutup. **Hapus** mengosongkan percakapan. Teks jawaban bisa ditekan lama untuk disalin.
- Pertanyaan dikirim ke `/api/chat` di Vercel, lalu diteruskan ke OpenAI. API key tidak ada di dalam APK.

Environment Variables Vercel tambahan:
- `OPENAI_API_KEY` (wajib) = API key OpenAI kamu.
- `OPENAI_MODEL` (opsional) = nama model, bawaan `gpt-4o-mini`. Ganti jika ingin model lain.
- `AI_ENDPOINT` (opsional) = URL penuh endpoint, misalnya `https://domain-kamu.vercel.app/api/chat`. Jika kosong, alamatnya diambil dari domain yang dipakai saat menekan Mulai Build. Buka website lewat domain production, bukan URL preview, dan matikan Deployment Protection untuk `/api/chat`, atau APK tidak bisa menghubungi server.

Catatan keamanan dan biaya: siapa pun yang memasang APK bisa memakai endpoint ini dan memakai kuota OpenAI kamu. Rate limit bawaan (15 permintaan/menit/IP) hanya best-effort karena memori serverless tidak dibagi antar instance. Atur batas pengeluaran di dashboard OpenAI. Jika APK akan disebar luas, tambahkan autentikasi atau rate limit permanen (misalnya Upstash/Vercel KV).

### Pakai Gemini (alternatif OpenAI)
Jika `GEMINI_API_KEY` diisi di Environment Variables Vercel, `/api/chat` otomatis memakai Gemini (endpoint kompatibel OpenAI) dan mengabaikan `OPENAI_API_KEY`.
- `GEMINI_API_KEY` = API key dari https://aistudio.google.com/apikey
- `GEMINI_MODEL` (opsional) = nama model, bawaan `gemini-flash-latest`.

### Scan website
Tombol **Scan** di samping kolom URL memanggil `/api/scan`, yang membaca halaman HTTPS publik (judul, manifest web, ikon, warna tema) lalu menampilkan pratinjau dan mengisi nama aplikasi, package ID, dan URL ikon secara otomatis jika masih kosong. Alamat internal/privat (localhost, 10.x, 192.168.x, 169.254.x, dll.) diblokir. Hanya ikon PNG/JPG yang diisi otomatis; ikon lain (ICO/SVG) perlu diunggah manual.


## Salin teks (termasuk teks pada foto)

Semua APK hasil build sekarang punya dua kemampuan salin teks, tanpa pengaturan tambahan:

- **Teks halaman**: tekan lama pada teks, geser pegangan untuk memilih, lalu ketuk **Salin**. Pemilihan teks dipaksa aktif di semua elemen, bahkan di website yang memasang `user-select: none` atau memblokir `selectstart`, `copy`, dan `contextmenu`. Skrip pembukanya ada di `web2apk_unlock.js` (dibuat otomatis oleh workflow) dan dijalankan setiap halaman dimuat, termasuk iframe satu origin.
- **Teks pada foto (OCR)**: tekan lama pada foto, lalu pilih **Salin teks dari foto ini** atau **Salin teks dari seluruh layar**. Hasilnya tampil di jendela yang teksnya bisa dipilih, dengan tombol **Salin semua**. OCR memakai ML Kit Text Recognition yang modelnya ikut di dalam APK, jadi jalan offline.

Catatan:
- OCR bawaan membaca huruf Latin (Indonesia, Inggris, dll.). Untuk huruf Mandarin, Jepang, Korea, atau Devanagari, tambahkan dependency ML Kit yang sesuai di `app/build.gradle` pada workflow.
- Ukuran APK bertambah karena model OCR ikut dibundel.
- Jika foto tidak bisa diunduh langsung (misalnya diblokir server), aplikasi otomatis memindai tampilan layar sebagai gantinya.
- Foto yang ditutup lapisan transparan oleh website bisa gagal terdeteksi sebagai foto saat ditekan lama. Pakai **Salin teks dari seluruh layar** dari foto lain, atau minta saya tambahkan tombol OCR melayang.

## Watermark developer di dalam APK
Setiap APK hasil build menampilkan label kecil semi-transparan "Dev: Yasam | WA 6281519986005" di pojok kanan bawah (tidak menghalangi sentuhan ke website), serta kredit dengan link WhatsApp di halaman offline. Teks dapat diubah pada konstanta `DEV_CREDIT` di `.github/workflows/build-apk.yml`.
