# MECHASSET — Fork & Automatic Setup Guide

Panduan ini menyiapkan instalasi MECHASSET yang terpisah untuk setiap pengguna. Repository, GitHub Pages, Cloudflare Worker, D1 Database, dan Gemini API Key akan menjadi milik akun masing-masing.

> **Penting:** jangan menggunakan Database ID atau Gemini API Key milik pemilik repository. Installer membuat/menggunakan database di akun Cloudflare Anda sendiri.

## 1. Persiapan akun

Siapkan:
- Akun GitHub: https://github.com/signup
- Akun Cloudflare: https://dash.cloudflare.com/sign-up
- Akun Google untuk Gemini API: https://aistudio.google.com/apikey

## 2. Fork repository MECHASSET

1. Login ke GitHub.
2. Buka https://github.com/hendriseptian/asset-register-extractor
3. Klik **Fork**.
4. Pada bagian Owner, pilih akun GitHub Anda.
5. Pertahankan nama repository `asset-register-extractor` (disarankan).
6. Klik **Create fork**.
7. Pastikan alamat repository menjadi `https://github.com/USERNAME-ANDA/asset-register-extractor`.

Fork adalah salinan repository di akun Anda. Perubahan di Fork tidak langsung mengubah repository sumber.

## 3. Buat Cloudflare API Token

Token ini memberi GitHub Actions izin membuat D1 dan deploy Worker di akun Cloudflare Anda.

1. Login ke https://dash.cloudflare.com/profile/api-tokens
2. Pilih **Create Token**.
3. Pilih **Create Custom Token**.
4. Beri nama, misalnya `MECHASSET GitHub Actions`.
5. Tambahkan permission berikut:
   - **Account — D1 — Edit**
   - **Account — Workers Scripts — Edit**
   - **Account — Account Settings — Read** (untuk membaca subdomain Worker saat menampilkan URL).
6. Pada **Account Resources**, batasi token ke akun Cloudflare Anda saja.
7. Buat token, lalu salin token yang ditampilkan. Token biasanya hanya ditampilkan sekali.

Jangan membagikan token ini dan jangan menaruhnya di source code.

## 4. Ambil Cloudflare Account ID

1. Buka Cloudflare Dashboard.
2. Pilih akun yang akan digunakan.
3. Di halaman Overview, cari **Account ID** pada bagian API.
4. Salin Account ID tersebut. Ini bukan D1 Database ID.

## 5. Buat Gemini API Key

1. Buka https://aistudio.google.com/apikey
2. Login dengan akun Google.
3. Buat API key.
4. Salin dan simpan secara privat.

Gemini API Key akan disimpan sebagai Cloudflare Worker Secret oleh installer. Jangan memasukkannya ke file HTML, JavaScript frontend, atau commit GitHub.

## 6. Simpan tiga GitHub Actions Secrets

Buka Fork Anda di GitHub:

1. Pilih **Settings**.
2. Pada sidebar, buka **Secrets and variables → Actions**.
3. Klik **New repository secret**.
4. Buat tiga secret berikut satu per satu:

| Secret name | Isi |
|---|---|
| `CLOUDFLARE_API_TOKEN` | API Token dari langkah 3 |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID dari langkah 4 |
| `GEMINI_API_KEY` | Gemini API Key dari langkah 5 |

Nama secret harus sama persis. Nilai secret tidak akan ditulis ke repository atau ditampilkan oleh workflow.

## 7. Jalankan Automatic Cloudflare Setup

> **Penting — jangan gunakan Cloudflare Workers Builds untuk deployment awal.** Jangan hubungkan Fork ke Cloudflare Workers Builds dan jangan menjalankan `npx wrangler deploy` dari build pipeline Cloudflare. File `worker/wrangler.toml` pada repository sumber bukan konfigurasi D1 untuk akun Fork. Workflow GitHub Actions di bawah membuat konfigurasi sementara yang memakai D1 milik pengguna sendiri.

1. Buka tab **Actions** di Fork Anda.
2. Jika GitHub meminta izin, klik **I understand my workflows, go ahead and enable them**.
3. Pilih workflow **MECHASSET - Automatic Cloudflare Setup**.
4. Klik **Run workflow**.
5. Isi:
   - **D1 database name:** `mechasset-db` (default).
   - **Worker name:** gunakan nama unik untuk Worker Anda, misalnya `mechasset-username`. Nama Worker harus unik dalam akun Cloudflare Anda.
6. Klik **Run workflow** dan tunggu hingga selesai dengan status hijau.

Workflow melakukan langkah berikut secara otomatis:
- Memeriksa apakah D1 dengan nama yang dipilih sudah ada di akun Anda.
- Menggunakan database yang sudah ada atau membuat database baru.
- Mengambil UUID database dari respons Cloudflare API.
- Membuat konfigurasi Wrangler sementara dengan D1 ID milik Anda. File konfigurasi sementara dihapus setelah proses.
- Menjalankan seluruh SQL migration yang tersedia di `worker/migrations`, termasuk skema PSV, BVV, dan PV.
- Menyimpan `GEMINI_API_KEY` sebagai Cloudflare Worker Secret.
- Deploy Cloudflare Worker.
- Menampilkan URL Worker jika subdomain Cloudflare dapat dibaca.

**Installer bersifat idempotent untuk database:** menjalankan ulang workflow dengan nama database yang sama akan menggunakan database yang sudah ada, bukan membuat database duplikat. Migration Wrangler hanya menerapkan migration yang belum tercatat.

Jika workflow gagal, buka run yang gagal dan periksa log langkah yang berwarna merah. Jangan menyalin atau membagikan nilai secret.

## 8. Aktifkan GitHub Pages

1. Buka Fork → **Settings → Pages**.
2. Pada **Build and deployment**, pilih **GitHub Actions** sebagai Source.
3. Buka tab **Actions**.
4. Pilih workflow **Deploy MECHASSET** dan jalankan **Run workflow** pada branch `main`, atau lakukan perubahan dokumentasi lalu push ke `main`.
5. Tunggu sampai workflow selesai dengan status hijau.
6. Buka URL GitHub Pages yang ditampilkan di **Settings → Pages**.

Workflow Pages menerbitkan frontend. Workflow Cloudflare Setup menerbitkan backend. Keduanya adalah deployment terpisah. Pengguna Fork tetap harus membuat tiga secrets miliknya sendiri; GitHub tidak menyalin secrets pemilik repository sumber ke Fork, dan hal ini memang diperlukan agar kredensial setiap pengguna tetap terpisah.

## 9. Hubungkan frontend dengan Worker

1. Salin URL Worker dari log workflow Cloudflare Setup. Jika tidak muncul, buka Cloudflare → **Workers & Pages** → Worker Anda → salin URL `workers.dev`.
2. Buka website GitHub Pages milik Anda.
3. Masukkan URL Worker tersebut pada pengaturan koneksi MECHASSET.
4. Simpan dan lanjutkan ke workspace.
5. Uji endpoint `https://URL-WORKER-ANDA/api/health`.
6. Uji koneksi database melalui endpoint `/api/db/health` jika tersedia pada versi aplikasi Anda.

Jangan memasukkan URL Worker milik pengguna lain.

## 10. Memperbarui Fork

1. Buka repository Fork Anda.
2. Klik **Sync fork** untuk melihat pembaruan dari repository sumber.
3. Tinjau perubahan sebelum menerima pembaruan.
4. Jika pembaruan mengubah backend atau file migration, jalankan kembali workflow **MECHASSET - Automatic Cloudflare Setup**. Workflow akan menggunakan database yang sama dan menerapkan migration yang belum berjalan.
5. Jika hanya frontend yang berubah, workflow **Deploy MECHASSET** akan menerbitkan ulang GitHub Pages setelah perubahan masuk ke branch `main`.

Jangan menyalin `worker/wrangler.toml` dari repository sumber ke konfigurasi instalasi pribadi. Installer menggunakan konfigurasi sementara dan D1 ID milik akun Anda.

## Troubleshooting

### Workflow tidak muncul di tab Actions
Pastikan GitHub Actions diaktifkan untuk Fork dan file `.github/workflows/setup-cloudflare.yml` ada di branch default repository.

### Cloudflare API 401 atau 403
Token salah/kedaluwarsa atau permission tidak cukup. Buat token baru dengan permission D1 Edit, Workers Scripts Edit, dan Account Settings Read pada akun yang benar. Perbarui secret `CLOUDFLARE_API_TOKEN`.

### Worker name already exists
Pilih nama Worker lain yang unik pada input **worker_name**, lalu jalankan ulang workflow.

### Database sudah ada
Ini normal. Installer akan menggunakan database dengan nama tersebut. Pastikan database itu memang database MECHASSET milik Anda. Jangan gunakan database milik aplikasi lain.

### Migration gagal
Buka log workflow. Pastikan D1 yang dipilih adalah database MECHASSET yang benar dan token memiliki permission D1 Edit. Jangan menghapus database untuk mencoba ulang.

### Gemini API key invalid atau quota habis
Perbarui secret `GEMINI_API_KEY` di GitHub Settings → Secrets and variables → Actions, lalu jalankan ulang workflow.

### Website tidak dapat terhubung ke Worker
Pastikan Pages dan Worker sama-sama berhasil deploy, URL Worker benar, dan URL menggunakan HTTPS.

## Komponen yang dibuat untuk setiap pengguna

| Komponen | Pemilik |
|---|---|
| Fork repository | Akun GitHub pengguna |
| GitHub Pages | Akun GitHub pengguna |
| Cloudflare Worker | Akun Cloudflare pengguna |
| D1 Database | Akun Cloudflare pengguna |
| Gemini API Key | Akun Google pengguna |
| Worker URL | Deployment Cloudflare pengguna |

## Catatan keamanan dan engineering

- API Token Cloudflare hanya disimpan sebagai GitHub Actions Secret.
- Gemini API Key hanya disimpan sebagai Cloudflare Worker Secret.
- D1 ID dibuat dan digunakan di workflow; tidak perlu menyalin ID repository utama.
- Jangan unggah dokumen client yang bersifat rahasia kecuali kebijakan perusahaan mengizinkan pemrosesan melalui layanan eksternal yang Anda pilih.
- Hasil ekstraksi AI adalah draft. Periksa setiap nilai terhadap dokumen sumber sebelum digunakan sebagai engineering register.
- Kuota, biaya, dan ketentuan GitHub, Cloudflare, dan Google mengikuti akun masing-masing pengguna.

## Alternatif: instalasi lokal Windows

Jika tidak ingin menggunakan GitHub Actions, repository tetap menyediakan `setup-mechasset.ps1` untuk instalasi lokal melalui PowerShell. Cara ini memerlukan Node.js LTS dan login Wrangler. Panduan ini adalah jalur alternatif; untuk instalasi otomatis berbasis GitHub Actions, ikuti langkah 3–9 di atas.
