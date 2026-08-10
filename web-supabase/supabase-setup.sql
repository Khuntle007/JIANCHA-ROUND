-- ============================================================
-- JIANCHA · ระบบรอบสั่ง–รอบส่ง — Supabase setup (ผู้ใช้รายคน + สิทธิ์ละเอียด)
-- วิธีใช้: Supabase Dashboard → SQL Editor → New query → วางทั้งหมด → Run
-- ------------------------------------------------------------
-- ความปลอดภัย:
--   • อ่าน/เขียนข้อมูลได้เฉพาะเมื่อล็อกอินด้วย "ชื่อผู้ใช้ + รหัสผ่าน" ที่ถูกต้อง (ตรวจฝั่งเซิร์ฟเวอร์)
--   • ไม่มี endpoint สาธารณะ — anon key เพียงอย่างเดียวเปิดข้อมูลไม่ได้
--   • มีบัญชีผู้ดูแลเริ่มต้น "admin" — แอดมินเข้าไปสร้างผู้ใช้อื่น + กำหนดสิทธิ์รายคนได้ในหน้าเว็บ
--   • แนะนำครอบเว็บด้วย Cloudflare Access อีกชั้น (อนุญาตเฉพาะอีเมลพนักงาน)
-- ⚠️ ก่อนรัน: เปลี่ยนรหัสผ่านของ admin ในบรรทัด "password" ด้านล่าง
-- ============================================================

-- 1) ตารางเก็บข้อมูลทั้งหมด (JSON ก้อนเดียว) — มี users อยู่ในนั้น
create table if not exists public.app_state (
  id int primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ค่าเริ่มต้น: มีบัญชีผู้ดูแล admin 1 คน (🔑 เปลี่ยน 'JIANCHA-CHANGE-ME' เป็นรหัสผ่านของคุณ)
insert into public.app_state (id, data)
values (1, '{"version":4,"users":[{"id":"admin","name":"ผู้ดูแลระบบ","username":"admin","password":"JIANCHA-CHANGE-ME","role":"admin","active":true,"scope":"all","perms":{}}],"branches":[],"orders":[],"holidays":[],"specials":[]}'::jsonb)
on conflict (id) do nothing;

-- 2) เปิด RLS และไม่ใส่ policy => เข้าตารางตรง ๆ ไม่ได้ ต้องผ่านฟังก์ชันเท่านั้น
alter table public.app_state enable row level security;

-- helper: ตรวจว่ามีผู้ใช้ที่ username+password ตรง และเปิดใช้งานอยู่
create or replace function public._auth_ok(p_user text, p_pass text)
returns boolean language sql security definer set search_path = public as $$
  select exists(
    select 1 from public.app_state, jsonb_array_elements(data->'users') e
    where id = 1
      and e.value->>'username' = p_user
      and e.value->>'password' = p_pass
      and coalesce(e.value->>'active','true') <> 'false'
  );
$$;

-- 3) ฟังก์ชันหลัก (SECURITY DEFINER, ทุกตัวต้องล็อกอิน)

-- login: คืนข้อมูลผู้ใช้ (ไม่รวมรหัสผ่าน) ถ้าถูกต้อง
create or replace function public.login(p_user text, p_pass text)
returns jsonb language sql security definer set search_path = public as $$
  select (e.value - 'password')
  from public.app_state, jsonb_array_elements(data->'users') e
  where id = 1
    and e.value->>'username' = p_user
    and e.value->>'password' = p_pass
    and coalesce(e.value->>'active','true') <> 'false'
  limit 1;
$$;

-- load: คืนข้อมูลทั้งหมด (ต้องล็อกอิน)
create or replace function public.load_state(p_user text, p_pass text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public._auth_ok(p_user, p_pass) then raise exception 'unauthorized'; end if;
  return (select data from public.app_state where id = 1);
end; $$;

-- save: เขียนข้อมูลทั้งหมด (ต้องล็อกอิน)
create or replace function public.save_state(p_user text, p_pass text, p_data jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public._auth_ok(p_user, p_pass) then raise exception 'unauthorized'; end if;
  update public.app_state set data = p_data, updated_at = now() where id = 1;
end; $$;

-- 4) อนุญาตให้เรียกฟังก์ชันผ่าน API (ทุกตัวบังคับล็อกอินอยู่แล้ว)
grant execute on function public.login(text, text)               to anon, authenticated;
grant execute on function public.load_state(text, text)          to anon, authenticated;
grant execute on function public.save_state(text, text, jsonb)   to anon, authenticated;
grant execute on function public._auth_ok(text, text)            to anon, authenticated;

-- เสร็จแล้ว ✅
-- ล็อกอินครั้งแรก: username = admin / password = ที่ตั้งไว้ด้านบน
-- จากนั้นเข้าเมนู "สิทธิ์ผู้ใช้" เพื่อสร้างผู้ใช้อื่น + เลือกสิทธิ์รายคน
