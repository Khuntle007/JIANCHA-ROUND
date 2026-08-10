<?php
/* ============================================================
   JIANCHA — ตัวตรวจความพร้อมเซิร์ฟเวอร์ (Server Readiness Check)
   วิธีใช้: อัปโหลดไฟล์นี้ขึ้นโฮสต์ แล้วเปิดในเบราว์เซอร์
            เช่น  https://โดเมนของคุณ/check.php
   ============================================================ */
header('Content-Type: text/html; charset=utf-8');

$checks = [];

// 1) PHP ทำงานไหม + เวอร์ชัน
$phpver = PHP_VERSION;
$checks[] = [
  'name' => 'PHP ทำงาน',
  'ok'   => true,
  'detail' => "เวอร์ชัน $phpver" . (version_compare($phpver,'7.0','>=') ? ' (เพียงพอ)' : ' (เก่าไป ควร ≥ 7.0)')
];

// 2) เขียนไฟล์ได้ไหม (สำหรับเก็บข้อมูล JSON)
$writeOK = false; $writeDetail = '';
$testFile = __DIR__ . '/_jc_write_test.tmp';
try {
  $r = @file_put_contents($testFile, 'ok');
  if ($r !== false) { $writeOK = true; @unlink($testFile); $writeDetail = 'เขียน/ลบไฟล์ในโฟลเดอร์นี้ได้'; }
  else { $writeDetail = 'เขียนไฟล์ไม่ได้ — ต้องตั้งสิทธิ์โฟลเดอร์ให้เขียนได้ (chmod 755/775)'; }
} catch (Exception $e) { $writeDetail = 'เขียนไฟล์ไม่ได้: ' . $e->getMessage(); }
$checks[] = ['name'=>'เขียนไฟล์ข้อมูลได้', 'ok'=>$writeOK, 'detail'=>$writeDetail];

// 3) JSON
$jsonOK = function_exists('json_encode') && function_exists('json_decode');
$checks[] = ['name'=>'รองรับ JSON', 'ok'=>$jsonOK, 'detail'=>$jsonOK?'พร้อมใช้งาน':'ไม่รองรับ (แปลก มาก—ควรอัปเดต PHP)'];

// 4) SQLite (ทางเลือก—ถ้ามีจะยิ่งดี แต่ไม่จำเป็น)
$sqliteOK = class_exists('PDO') && in_array('sqlite', PDO::getAvailableDrivers() ?: []);
$checks[] = ['name'=>'SQLite (ทางเลือก)', 'ok'=>$sqliteOK, 'detail'=>$sqliteOK?'มี — ใช้เป็นฐานข้อมูลได้เลย':'ไม่มี — ไม่เป็นไร ใช้ไฟล์ JSON แทนได้'];

// สรุป
$required = $checks[0]['ok'] && $checks[1]['ok'] && $checks[2]['ok'];
?>
<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>JIANCHA · ตรวจเซิร์ฟเวอร์</title>
<style>
body{font-family:'Sarabun','Segoe UI',sans-serif;background:#F3F1EB;color:#181818;max-width:640px;margin:2rem auto;padding:1rem}
h1{font-size:1.3rem;letter-spacing:.02em}
.k{color:#AD9C82;font-size:.72rem;letter-spacing:.18em;text-transform:uppercase}
.card{background:#fff;border:1px solid rgba(84,83,81,.18);border-radius:2px;padding:1.2rem;margin-top:1rem}
.row{display:flex;align-items:flex-start;gap:.7rem;padding:.6rem 0;border-bottom:1px solid rgba(84,83,81,.12)}
.row:last-child{border-bottom:0}
.ic{font-size:1.1rem;line-height:1.4}
.ok{color:#2E7D46}.bad{color:#C0392B}
.name{font-weight:600}.detail{color:#545351;font-size:.9rem}
.verdict{margin-top:1rem;padding:1rem;border-radius:2px;font-weight:600}
.vok{background:#E4F1E8;color:#2E7D46;border:1px solid #A9D3B6}
.vbad{background:#FBE7E4;color:#C0392B;border:1px solid #E7A9A2}
small{color:#545351}
</style></head><body>
<div class="k">JIANCHA · SERVER CHECK</div>
<h1>ผลตรวจความพร้อมเซิร์ฟเวอร์</h1>
<div class="card">
<?php foreach ($checks as $c): ?>
  <div class="row">
    <div class="ic <?= $c['ok']?'ok':'bad' ?>"><?= $c['ok']?'✓':'✕' ?></div>
    <div><div class="name"><?= htmlspecialchars($c['name']) ?></div>
    <div class="detail"><?= htmlspecialchars($c['detail']) ?></div></div>
  </div>
<?php endforeach; ?>
</div>

<?php if ($required): ?>
  <div class="verdict vok">✓ พร้อมใช้งาน! โฮสต์นี้รัน PHP + เขียนไฟล์ได้ — ส่งภาพหน้านี้ให้ผม แล้วผมจะส่งชุดเว็บจริง (index.html + api.php) ให้วางลงโฮสต์ได้เลย</div>
<?php else: ?>
  <div class="verdict vbad">✕ ยังไม่พร้อม — ถ้า “PHP ทำงาน” ขึ้น ✕ แปลว่าโฮสต์อาจเป็นแบบ static (ไฟล์นิ่งๆ) ต้องใช้ฐานข้อมูลภายนอกแทน · ถ้า “เขียนไฟล์ได้” ขึ้น ✕ ให้ตั้งสิทธิ์โฟลเดอร์เป็น 755/775 แล้วรีเฟรช</div>
<?php endif; ?>

<p><small>เซิร์ฟเวอร์: <?= htmlspecialchars($_SERVER['SERVER_SOFTWARE'] ?? 'ไม่ทราบ') ?> · โฮสต์: <?= htmlspecialchars($_SERVER['HTTP_HOST'] ?? '-') ?></small></p>
</body></html>
