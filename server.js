const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const XLSX = require('xlsx');

const app = express();
const PORT = process.env.PORT || 2000;
const DB_FILE = path.join(__dirname, 'database.json');

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ====== SURAT JUZ 30 ======
const SURAT_JUZ30 = [
  'An-Naba', 'An-Nazi\'at', 'Abasa', 'At-Takwir', 'Al-Infitar', 'Al-Mutaffifin',
  'Al-Insyiqaq', 'Al-Buruj', 'At-Tariq', 'Al-A\'la', 'Al-Gasyiyah', 'Al-Fajr',
  'Al-Balad', 'Asy-Syams', 'Al-Lail', 'Ad-Duha', 'Asy-Syarh', 'At-Tin',
  'Al-Alaq', 'Al-Qadr', 'Al-Bayyinah', 'Az-Zalzalah', 'Al-Adiyat', 'Al-Qari\'ah',
  'At-Takasur', 'Al-Asr', 'Al-Humazah', 'Al-Fil', 'Quraisy', 'Al-Ma\'un',
  'Al-Kausar', 'Al-Kafirun', 'An-Nasr', 'Al-Lahab', 'Al-Ikhlas', 'Al-Falaq', 'An-Nas'
];

// ====== DATABASE ======
const DB_DEFAULT = {
  meta: { version: 1, createdAt: new Date().toISOString() },
  kelas: [],
  siswa: []
};

function loadDB() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(DB_DEFAULT, null, 2));
      return JSON.parse(JSON.stringify(DB_DEFAULT));
    }
    const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (!raw.kelas) raw.kelas = [];
    if (!raw.siswa) raw.siswa = [];
    if (!raw.meta) raw.meta = { version: 1 };
    return raw;
  } catch {
    return JSON.parse(JSON.stringify(DB_DEFAULT));
  }
}

function saveDB(db) {
  db.meta.updatedAt = new Date().toISOString();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function genId(prefix = '') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ====== SURAT API ======
app.get('/api/surat', (req, res) => res.json(SURAT_JUZ30));

// ====== STATE API ======
app.get('/api/state', (req, res) => {
  const db = loadDB();
  const kelas = db.kelas.map(k => ({
    ...k,
    jumlahSiswa: db.siswa.filter(s => s.kelasId === k.id).length
  }));
  res.json({ kelas, siswa: db.siswa, surat: SURAT_JUZ30 });
});

// ====== KELAS ======
app.get('/api/kelas', (req, res) => {
  const db = loadDB();
  const result = db.kelas.map(k => ({
    ...k,
    jumlahSiswa: db.siswa.filter(s => s.kelasId === k.id).length
  }));
  res.json(result);
});

app.post('/api/kelas', (req, res) => {
  const { nama } = req.body;
  const list = Array.isArray(nama) ? nama : [nama];
  const db = loadDB();
  const added = [];
  const skipped = [];

  list.forEach(nm => {
    const clean = String(nm || '').trim();
    if (!clean) return;
    const exists = db.kelas.some(k => k.nama.toLowerCase() === clean.toLowerCase());
    if (exists) { skipped.push(clean); return; }
    const k = {
      id: genId('k_'),
      nama: clean,
      createdAt: new Date().toISOString()
    };
    db.kelas.push(k);
    added.push({ ...k, jumlahSiswa: 0 });
  });

  saveDB(db);
  res.json({
    added,
    skipped,
    kelas: db.kelas.map(k => ({
      ...k,
      jumlahSiswa: db.siswa.filter(s => s.kelasId === k.id).length
    }))
  });
});

app.put('/api/kelas/:id', (req, res) => {
  const { id } = req.params;
  const { nama } = req.body;
  const db = loadDB();
  const idx = db.kelas.findIndex(k => k.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Kelas tidak ditemukan' });
  const clean = String(nama || '').trim();
  if (!clean) return res.status(400).json({ error: 'Nama kelas wajib' });
  if (db.kelas.some((k, i) => i !== idx && k.nama.toLowerCase() === clean.toLowerCase())) {
    return res.status(400).json({ error: 'Nama kelas sudah ada' });
  }
  db.kelas[idx].nama = clean;
  db.kelas[idx].updatedAt = new Date().toISOString();
  saveDB(db);
  res.json({
    ...db.kelas[idx],
    jumlahSiswa: db.siswa.filter(s => s.kelasId === id).length
  });
});

app.delete('/api/kelas/:id', (req, res) => {
  const { id } = req.params;
  const db = loadDB();
  const jumlah = db.siswa.filter(s => s.kelasId === id).length;
  if (jumlah > 0) {
    return res.status(400).json({ error: `Kelas masih punya ${jumlah} siswa. Hapus siswa dulu.` });
  }
  db.kelas = db.kelas.filter(k => k.id !== id);
  saveDB(db);
  res.json({ ok: true });
});

// ====== SISWA ======
app.get('/api/siswa', (req, res) => {
  const db = loadDB();
  const { kelasId } = req.query;
  let result = db.siswa;
  if (kelasId) result = result.filter(s => s.kelasId === kelasId);
  res.json(result);
});

app.post('/api/siswa', (req, res) => {
  const { nama, kelasId, hafalan } = req.body;
  if (!nama || !kelasId) return res.status(400).json({ error: 'Nama & kelas wajib' });
  const db = loadDB();
  if (!db.kelas.some(k => k.id === kelasId)) return res.status(400).json({ error: 'Kelas tidak ditemukan' });
  const newS = {
    id: genId('s_'),
    nama: String(nama).trim(),
    kelasId,
    hafalan: Array.isArray(hafalan) ? hafalan.map(h => ({ surat: h.surat, nilai: Number(h.nilai) || 0 })) : [],
    createdAt: new Date().toISOString()
  };
  db.siswa.push(newS);
  saveDB(db);
  res.json(newS);
});

app.put('/api/siswa/:id', (req, res) => {
  const { id } = req.params;
  const { nama, kelasId, hafalan } = req.body;
  const db = loadDB();
  const idx = db.siswa.findIndex(s => s.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Siswa tidak ditemukan' });
  if (nama) db.siswa[idx].nama = String(nama).trim();
  if (kelasId) {
    if (!db.kelas.some(k => k.id === kelasId)) return res.status(400).json({ error: 'Kelas tidak ditemukan' });
    db.siswa[idx].kelasId = kelasId;
  }
  if (Array.isArray(hafalan)) {
    db.siswa[idx].hafalan = hafalan.map(h => ({ surat: h.surat, nilai: Number(h.nilai) || 0 }));
  }
  db.siswa[idx].updatedAt = new Date().toISOString();
  saveDB(db);
  res.json(db.siswa[idx]);
});

app.delete('/api/siswa/:id', (req, res) => {
  const { id } = req.params;
  const db = loadDB();
  db.siswa = db.siswa.filter(s => s.id !== id);
  saveDB(db);
  res.json({ ok: true });
});

// ====== EXPORT EXCEL (mendukung ?kelasId=) ======
app.get('/api/export/excel', (req, res) => {
  try {
    const { kelasId } = req.query;
    const db = loadDB();

    let siswaList = db.siswa;
    let targetKelas = null;

    if (kelasId) {
      targetKelas = db.kelas.find(k => k.id === kelasId);
      if (!targetKelas) return res.status(404).json({ error: 'Kelas tidak ditemukan' });
      siswaList = db.siswa.filter(s => s.kelasId === kelasId);
    }

    const wb = XLSX.utils.book_new();
    const header = ['No', 'Nama Siswa', 'Kelas', ...SURAT_JUZ30, 'Total', 'Rata-rata'];
    const rows = siswaList.map((s, i) => {
      const kls = db.kelas.find(k => k.id === s.kelasId);
      const nilaiMap = {};
      s.hafalan.forEach(h => { nilaiMap[h.surat] = h.nilai; });
      const nilaiArr = s.hafalan.map(h => h.nilai);
      const total = nilaiArr.reduce((a, b) => a + b, 0);
      const rata = nilaiArr.length ? (total / nilaiArr.length).toFixed(1) : '0';
      return [
        i + 1, s.nama, kls ? kls.nama : '-',
        ...SURAT_JUZ30.map(sr => nilaiMap[sr] !== undefined ? nilaiMap[sr] : ''),
        total, rata
      ];
    });

    const ws1 = XLSX.utils.aoa_to_sheet([header, ...rows]);
    ws1['!cols'] = [
      { wch: 5 }, { wch: 22 }, { wch: 10 },
      ...SURAT_JUZ30.map(() => ({ wch: 10 })),
      { wch: 8 }, { wch: 10 }
    ];
    XLSX.utils.book_append_sheet(wb, ws1, 'Data Hafalan');

    // Sheet "Daftar Kelas" hanya muncul untuk export global
    if (!kelasId) {
      const ws2 = XLSX.utils.aoa_to_sheet([
        ['No', 'Nama Kelas', 'Jumlah Siswa'],
        ...db.kelas.map((k, i) => [
          i + 1, k.nama,
          db.siswa.filter(s => s.kelasId === k.id).length
        ])
      ]);
      ws2['!cols'] = [{ wch: 5 }, { wch: 20 }, { wch: 15 }];
      XLSX.utils.book_append_sheet(wb, ws2, 'Daftar Kelas');
    }

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const safeName = targetKelas
      ? targetKelas.nama.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')
      : 'semua-kelas';
    res.setHeader('Content-Disposition', `attachment; filename="hafalan-${safeName}-${Date.now()}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Gagal export: ' + e.message });
  }
});

// ====== IMPORT EXCEL (mendukung paksa kelasId) ======
app.post('/api/import/excel', (req, res) => {
  try {
    const { file, kelasId: forceKelasId } = req.body;
    if (!file) return res.status(400).json({ error: 'File tidak ada' });

    const base64 = file.includes(',') ? file.split(',')[1] : file;
    const buf = Buffer.from(base64, 'base64');
    const wb = XLSX.read(buf, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (rows.length < 2) return res.status(400).json({ error: 'File kosong atau format salah' });

    const header = rows[0].map(h => String(h).trim());
    const idxNama = header.findIndex(h => /nama/i.test(h));
    if (idxNama === -1) return res.status(400).json({ error: 'Kolom "Nama" wajib ada di baris 1' });

    const db = loadDB();
    let targetKelas = null;
    let idxKelas = -1;

    if (forceKelasId) {
      targetKelas = db.kelas.find(k => k.id === forceKelasId);
      if (!targetKelas) return res.status(400).json({ error: 'Kelas tujuan tidak ditemukan' });
    } else {
      idxKelas = header.findIndex(h => /kelas/i.test(h));
      if (idxKelas === -1) {
        return res.status(400).json({ error: 'Kolom "Kelas" wajib ada (atau import dari halaman kelas)' });
      }
    }

    const suratMap = {};
    header.forEach((h, i) => {
      const found = SURAT_JUZ30.find(sr => sr.toLowerCase() === h.toLowerCase());
      if (found) suratMap[i] = found;
    });

    if (Object.keys(suratMap).length === 0) {
      return res.status(400).json({ error: 'Tidak ada kolom surat yang dikenali. Gunakan template.' });
    }

    let importedSiswa = 0;
    let updatedSiswa = 0;
    let importedKelas = 0;

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const nama = String(row[idxNama] || '').trim();
      if (!nama) continue;

      let kls;
      if (targetKelas) {
        kls = targetKelas;
      } else {
        const kelasNama = String(row[idxKelas] || '').trim();
        if (!kelasNama) continue;
        kls = db.kelas.find(k => k.nama.toLowerCase() === kelasNama.toLowerCase());
        if (!kls) {
          kls = { id: genId('k_'), nama: kelasNama, createdAt: new Date().toISOString() };
          db.kelas.push(kls);
          importedKelas++;
        }
      }

      const hafalan = [];
      Object.keys(suratMap).forEach(i => {
        const val = row[i];
        if (val !== '' && val !== null && val !== undefined && !isNaN(Number(val))) {
          hafalan.push({ surat: suratMap[i], nilai: Number(val) });
        }
      });

      const existing = db.siswa.find(s =>
        s.nama.toLowerCase() === nama.toLowerCase() && s.kelasId === kls.id
      );

      if (existing) {
        const map = {};
        existing.hafalan.forEach(h => { map[h.surat] = h.nilai; });
        hafalan.forEach(h => { map[h.surat] = h.nilai; });
        existing.hafalan = Object.keys(map).map(sr => ({ surat: sr, nilai: map[sr] }));
        existing.updatedAt = new Date().toISOString();
        updatedSiswa++;
      } else {
        db.siswa.push({
          id: genId('s_'),
          nama, kelasId: kls.id, hafalan,
          createdAt: new Date().toISOString()
        });
        importedSiswa++;
      }
    }

    saveDB(db);
    res.json({ ok: true, importedSiswa, updatedSiswa, importedKelas });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Gagal import: ' + e.message });
  }
});

// ====== TEMPLATE EXCEL (mendukung ?kelasId=) ======
app.get('/api/template/excel', (req, res) => {
  const { kelasId } = req.query;
  const db = loadDB();
  let kelasNama = '7A';
  if (kelasId) {
    const k = db.kelas.find(k => k.id === kelasId);
    if (k) kelasNama = k.nama;
  }

  const header = ['Nama', 'Kelas', ...SURAT_JUZ30];
  const example = ['Contoh Siswa', kelasNama, 90, 85];
  const ws = XLSX.utils.aoa_to_sheet([header, example]);
  ws['!cols'] = [{ wch: 20 }, { wch: 10 }, ...SURAT_JUZ30.map(() => ({ wch: 10 }))];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template Import');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const safeName = kelasId
    ? `template-${kelasNama.replace(/[^a-z0-9]+/gi, '-')}.xlsx`
    : 'template-import-hafalan.xlsx';
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

app.listen(PORT, () => console.log(`Server jalan di port ${PORT}`));
