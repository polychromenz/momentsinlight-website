// Contacts (venues and suppliers): search by name, business or type; tap one to call, email or edit.
// /api/studio/crm/contacts.
import { useMemo, useState } from 'react';
import { api } from '../api';
import { useNav, useRefresh } from '../nav';
import { Loading, Problem, useLoad } from '../ui';
import { Contact, type ContactRow } from './Contact';

export function Contacts() {
  const nav = useNav();
  const refresh = useRefresh();
  const [data, error, reload] = useLoad(() => api<{ contacts: ContactRow[]; types: string[] }>('crm/contacts'), [refresh]);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const list = useMemo(() => {
    const words = q.trim().toLowerCase();
    return (data?.contacts ?? [])
      .filter((c) => (!type || c.type === type) && (!words || `${c.business} ${c.contact_name} ${c.email} ${c.type}`.toLowerCase().includes(words)))
      .sort((a, b) => (a.business || a.contact_name).localeCompare(b.business || b.contact_name));
  }, [data, q, type]);
  if (error) return <Problem error={error} retry={reload} />;
  if (!data) return <Loading />;
  const types = [...new Set(data.contacts.map((c) => c.type).filter(Boolean))].sort();
  return (
    <>
      <header className="top"><div className="top-title"><h1>Contacts</h1></div></header>
      <div className="search-wrap"><input className="search" type="search" placeholder="Search contacts…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="seg">
        <button type="button" className={!type ? 'on' : ''} onClick={() => setType('')}>All</button>
        {types.map((t) => <button key={t} type="button" className={type === t ? 'on' : ''} onClick={() => setType(t)}>{t}</button>)}
      </div>
      <section className="card">
        <ul className="list">
          {list.map((c) => (
            <li key={c.id}><button type="button" className="row" onClick={() => nav.push(<Contact id={c.id} types={data.types} />)}>
              <span className="row-main"><strong>{c.business || c.contact_name}</strong><small>{[c.type, c.business ? c.contact_name : ''].filter(Boolean).join(' · ')}</small></span><span className="chev">›</span>
            </button></li>
          ))}
          {!list.length && <li className="empty">No contacts found.</li>}
        </ul>
      </section>
      <button type="button" className="fab" aria-label="Add a contact" onClick={() => nav.push(<Contact types={data.types} />)}>+</button>
    </>
  );
}
