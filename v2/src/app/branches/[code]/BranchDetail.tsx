'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, toast, Modal, copyText, useConfirm } from '@/components/client';
import { RoundsTable } from '@/components/RoundsTable';
import { OrdersTable, type OrderRow } from '@/components/OrdersTable';
import { RoundsEditor, BranchEditor, OrderEditor } from '../editors';
import { nextStatus, type RoundLike } from '@/lib/domain';
import { fmtDate, addDays, sameMonth } from '@/lib/dates';
import type { Feature } from '@/lib/perms';

type Branch = { code: string; nameEn: string; nameTh: string; address: string; phone: string; am: string; company: string; type: string; openDate: string; mallCondition: string; mapUrl: string; active: boolean; rounds: RoundLike[] };

export function BranchDetail({ branch: b, orders, today, perms }: { branch: Branch; orders: OrderRow[]; today: string; perms: Record<Feature, boolean> }) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const [modal, setModal] = useState<null | 'rounds' | 'roundsNew' | 'branch' | 'share' | 'history' | { order?: OrderRow }>(null);
  const [share, setShare] = useState<string | null>(null);
  const { ask, node } = useConfirm();
  const recent = orders.filter(o => sameMonth(o.orderDate, today) || o.orderDate >= addDays(today, -60));

  const info: [string, React.ReactNode][] = [
    ['ที่อยู่', b.address], ['เบอร์โทร', b.phone], ['AM', b.am], ['บริษัท', b.company],
    ['ประเภท', b.type === 'MT' ? 'MT · Modern Trade' : b.type === 'FC' ? 'FC · Franchise' : ''],
    ['วันเปิด', b.openDate ? fmtDate(b.openDate) : ''], ['เงื่อนไขห้าง', b.mallCondition],
    ['แผนที่', b.mapUrl ? <a href={b.mapUrl} target="_blank" rel="noopener noreferrer">เปิดแผนที่ ↗</a> : ''],
  ];

  return (
    <>
      <div className="small" style={{ marginBottom: '.5rem' }}><Link href="/branches" className="muted">‹ สาขาทั้งหมด</Link></div>
      <div className="pagehead">
        <div><div className="kicker">{b.code}{!b.active && ' · ปิดใช้งาน'}</div><h1 className="th">{b.nameEn}</h1>{b.nameTh && <div className="muted th">{b.nameTh}</div>}</div>
        <div className="row">
          {perms.share && <button className="btn ghost" onClick={async () => { try { setShare((await api<{ url: string }>(`/api/branches/${b.code}/share`, { method: 'POST' })).url); setModal('share'); } catch (e) { toast((e as Error).message); } }}>แชร์ลิงก์สาขา</button>}
          {perms.history && perms.orders && <button className="btn ghost" onClick={() => setModal('history')}>ประวัติ 1 ปี</button>}
          {perms.editBranch && <button className="btn" onClick={() => setModal('branch')}>แก้ไขข้อมูลสาขา</button>}
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="grid2">{info.map(([k, v]) => <div key={k} className="small th" style={{ padding: '.25rem 0' }}><span className="muted">{k}: </span>{v || '—'}</div>)}</div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: '.6rem' }}><div className="kicker">รอบสั่ง–รับของ</div>
          {perms.editRounds && <div className="row"><button className="btn sm ghost" onClick={() => setModal('roundsNew')}>+ เพิ่มสินค้า/คลัง</button><button className="btn sm" onClick={() => setModal('rounds')}>ตั้งค่ารอบ</button></div>}</div>
        <RoundsTable rounds={b.rounds} />
      </div>

      {perms.orders && (
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: '.4rem' }}><div className="kicker">ออเดอร์ PO / TR <span className="muted" style={{ letterSpacing: 0, textTransform: 'none' }}>(60 วันล่าสุด)</span></div>
            {perms.editOrders && <button className="btn sm gold" onClick={() => setModal({})}>+ เพิ่มออเดอร์</button>}</div>
          <OrdersTable orders={recent}
            onStatus={perms.editOrders ? async o => { try { await api(`/api/orders/${o.id}`, { method: 'PATCH', body: { status: nextStatus(o.status) } }); refresh(); } catch (e) { toast((e as Error).message); } } : undefined}
            actions={perms.editOrders ? o => <div className="rowx">
              <button className="btn sm ghost" onClick={() => setModal({ order: o })}>แก้</button>
              <button className="btn sm ghost" onClick={() => ask('ลบออเดอร์นี้?', async () => { await api(`/api/orders/${o.id}`, { method: 'DELETE' }); toast('ลบแล้ว'); refresh(); }, { danger: true, yes: 'ลบ' })}>ลบ</button>
            </div> : undefined} />
        </div>
      )}

      {(modal === 'rounds' || modal === 'roundsNew') && <RoundsEditor code={b.code} name={b.nameEn} rounds={b.rounds} addNew={modal === 'roundsNew'} onClose={() => setModal(null)} onSaved={() => { setModal(null); refresh(); }} />}
      {modal === 'branch' && <BranchEditor branch={b} onClose={() => setModal(null)} onSaved={() => { setModal(null); refresh(); }} onDeleted={() => router.push('/branches')} />}
      {modal && typeof modal === 'object' && <OrderEditor branchCode={b.code} order={modal.order} onClose={() => setModal(null)} onSaved={() => { setModal(null); refresh(); }} />}
      {modal === 'history' && (
        <Modal title={`ประวัติออเดอร์ 1 ปี · ${b.code}`} onClose={() => setModal(null)} width={900}>
          <OrdersTable orders={orders} />
        </Modal>
      )}
      {modal === 'share' && share && (
        <Modal title="แชร์ลิงก์สาขา" onClose={() => setModal(null)} width={520}>
          <p className="th small" style={{ marginTop: 0 }}>ลิงก์นี้เปิดดูได้โดยไม่ต้องล็อกอิน: ข้อมูลสาขา, รอบสั่ง–ส่ง และออเดอร์เดือนปัจจุบัน (อ่านอย่างเดียว)</p>
          <div className="linkbox"><code>{share}</code><button className="btn sm" onClick={() => copyText(share)}>คัดลอก</button><a className="btn sm ghost" href={share} target="_blank" rel="noopener">เปิด</a></div>
          <div className="row" style={{ justifyContent: 'space-between', marginTop: '1rem' }}>
            <button className="btn sm danger" onClick={() => ask('ยกเลิกลิงก์นี้? คนที่มีลิงก์เดิมจะเปิดไม่ได้อีก', async () => { await api(`/api/branches/${b.code}/share`, { method: 'DELETE' }); setModal(null); toast('ยกเลิกลิงก์แล้ว — แชร์ใหม่จะได้ลิงก์ใหม่'); }, { danger: true, yes: 'ยกเลิกลิงก์' })}>ยกเลิกลิงก์นี้</button>
            <button className="btn gold" onClick={() => setModal(null)}>ปิด</button>
          </div>
        </Modal>
      )}
      {node}
    </>
  );
}
