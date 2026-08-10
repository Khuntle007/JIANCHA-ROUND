-- ============================================================
-- JIANCHA · ระบบรอบสั่ง–รอบส่ง — Supabase setup (เวอร์ชันปลอดภัยสำหรับใช้ภายในองค์กร)
-- วิธีใช้: Supabase Dashboard → SQL Editor → New query → วางทั้งหมด → Run
-- ------------------------------------------------------------
-- ความปลอดภัย:
--   • ข้อมูลทั้งหมดอ่าน/เขียนได้เฉพาะเมื่อมี "รหัสผ่านองค์กร" (ตรวจที่ฝั่งเซิร์ฟเวอร์)
--   • ไม่มี endpoint สาธารณะใด ๆ — anon key เพียงอย่างเดียวเปิดข้อมูลไม่ได้
--   • แนะนำครอบเว็บด้วย Cloudflare Access อีกชั้น (อนุญาตเฉพาะอีเมลพนักงาน)
-- ⚠️ ก่อนรัน: เปลี่ยนรหัสผ่านในบรรทัด edit_password ด้านล่าง
-- ============================================================

-- 1) ตาราง
create table if not exists public.app_state (
  id int primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public.app_config (
  id int primary key,
  edit_password text not null
);

insert into public.app_state (id, data)
values (1, '{"version":3,"branches":[],"users":[],"orders":[],"holidays":[],"specials":[]}'::jsonb)
on conflict (id) do nothing;

-- 🔑 ตั้งรหัสผ่านองค์กรตรงนี้ (เปลี่ยน 'JIANCHA-CHANGE-ME')
insert into public.app_config (id, edit_password)
values (1, 'JIANCHA-CHANGE-ME')
on conflict (id) do nothing;

-- 2) เปิด RLS และไม่ใส่ policy => เข้าตารางตรง ๆ ไม่ได้ ต้องผ่านฟังก์ชันเท่านั้น
alter table public.app_state  enable row level security;
alter table public.app_config enable row level security;

-- 3) ฟังก์ชัน (SECURITY DEFINER, ทุกตัวต้องมีรหัสผ่าน)
create or replace function public.check_password(p_password text)
returns boolean language sql security definer set search_path = public as $$
  select exists(select 1 from public.app_config where id = 1 and edit_password = p_password);
$$;

create or replace function public.load_state(p_password text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ok boolean;
begin
  select (edit_password = p_password) into ok from public.app_config where id = 1;
  if not coalesce(ok, false) then raise exception 'unauthorized'; end if;
  return (select data from public.app_state where id = 1);
end; $$;

create or replace function public.save_state(p_password text, p_data jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare ok boolean;
begin
  select (edit_password = p_password) into ok from public.app_config where id = 1;
  if not coalesce(ok, false) then raise exception 'unauthorized'; end if;
  update public.app_state set data = p_data, updated_at = now() where id = 1;
end; $$;

-- 4) อนุญาตให้เรียกฟังก์ชันผ่าน API (แต่ทุกฟังก์ชันบังคับรหัสผ่านอยู่แล้ว)
grant execute on function public.check_password(text)    to anon, authenticated;
grant execute on function public.load_state(text)        to anon, authenticated;
grant execute on function public.save_state(text, jsonb) to anon, authenticated;

-- (ไม่มีฟังก์ชัน load_branch แบบสาธารณะ — ตัดออกเพื่อไม่ให้ข้อมูลรั่ว)

-- เสร็จแล้ว ✅  นำ Project URL + anon key ไปใส่ในไฟล์ index.html
-- เปลี่ยนรหัสผ่านภายหลัง: update public.app_config set edit_password='รหัสใหม่' where id=1;
