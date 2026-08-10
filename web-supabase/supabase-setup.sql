-- ============================================================
-- JIANCHA · ระบบรอบสั่ง–รอบส่ง — Supabase setup
-- วิธีใช้: Supabase Dashboard → SQL Editor → New query → วางทั้งหมด → Run
-- ------------------------------------------------------------
-- ⚠️ ก่อนรัน: เปลี่ยนรหัสผ่านผู้ดูแลในบรรทัด edit_password ด้านล่าง
-- ============================================================

-- 1) ตาราง: เก็บข้อมูลทั้งหมดเป็นก้อน JSON เดียว + ตารางตั้งค่า (รหัสผ่าน)
create table if not exists public.app_state (
  id         int primary key,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public.app_config (
  id            int primary key,
  edit_password text not null
);

-- ค่าเริ่มต้น (สร้างครั้งแรกเท่านั้น)
insert into public.app_state (id, data)
values (1, '{"version":3,"branches":[],"users":[],"orders":[],"holidays":[],"specials":[]}'::jsonb)
on conflict (id) do nothing;

-- 🔑 ตั้งรหัสผ่านผู้ดูแลตรงนี้ (เปลี่ยน 'JIANCHA-CHANGE-ME' เป็นรหัสของคุณ)
insert into public.app_config (id, edit_password)
values (1, 'JIANCHA-CHANGE-ME')
on conflict (id) do nothing;

-- 2) เปิด Row Level Security และไม่ใส่ policy ใด ๆ
--    => ผู้ใช้ทั่วไป (anon) เข้าตารางตรง ๆ ไม่ได้ ต้องผ่านฟังก์ชันด้านล่างเท่านั้น
alter table public.app_state  enable row level security;
alter table public.app_config enable row level security;

-- 3) ฟังก์ชัน (SECURITY DEFINER = ทำงานด้วยสิทธิ์เจ้าของ ข้าม RLS ได้)

-- ตรวจรหัสผ่าน (ใช้ตอนล็อกอิน)
create or replace function public.check_password(p_password text)
returns boolean language sql security definer set search_path = public as $$
  select exists(select 1 from public.app_config where id = 1 and edit_password = p_password);
$$;

-- โหลดข้อมูลทั้งหมด (ต้องมีรหัสผ่าน — สำหรับหน้าผู้ดูแล)
create or replace function public.load_state(p_password text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ok boolean;
begin
  select (edit_password = p_password) into ok from public.app_config where id = 1;
  if not coalesce(ok, false) then raise exception 'unauthorized'; end if;
  return (select data from public.app_state where id = 1);
end; $$;

-- บันทึกข้อมูลทั้งหมด (ต้องมีรหัสผ่าน)
create or replace function public.save_state(p_password text, p_data jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare ok boolean;
begin
  select (edit_password = p_password) into ok from public.app_config where id = 1;
  if not coalesce(ok, false) then raise exception 'unauthorized'; end if;
  update public.app_state set data = p_data, updated_at = now() where id = 1;
end; $$;

-- โหลดข้อมูลเฉพาะ 1 สาขา + ออเดอร์เดือนปัจจุบัน (สาธารณะ — สำหรับลิงก์แชร์)
create or replace function public.load_branch(p_code text)
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'branch',   (select e.value from jsonb_array_elements(data->'branches') e
                 where e.value->>'code' = p_code limit 1),
    'orders',   (select coalesce(jsonb_agg(o.value), '[]'::jsonb) from jsonb_array_elements(data->'orders') o
                 where o.value->>'branch' = p_code
                   and left(o.value->>'orderDate', 7) = to_char(now(), 'YYYY-MM')),
    'specials', (select coalesce(jsonb_agg(s.value), '[]'::jsonb) from jsonb_array_elements(data->'specials') s
                 where s.value->>'branch' = p_code),
    'holidays', coalesce(data->'holidays', '[]'::jsonb)
  )
  from public.app_state where id = 1;
$$;

-- 4) อนุญาตให้เรียกฟังก์ชันผ่าน API (anon = ผู้ใช้ที่ไม่ล็อกอิน)
grant execute on function public.check_password(text)        to anon, authenticated;
grant execute on function public.load_state(text)            to anon, authenticated;
grant execute on function public.save_state(text, jsonb)     to anon, authenticated;
grant execute on function public.load_branch(text)           to anon, authenticated;

-- เสร็จแล้ว ✅  ต่อไปนำ Project URL + anon key ไปใส่ในไฟล์ index.html
