import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LearnixLayout from "../components/LearnixLayout";
import Avatar from "../components/Avatar";
import { useLanguage } from "../context/LanguageContext";
import { apiFetch, readApiJson } from "../services/api";
import { getStoredUser } from "../services/roles";

function Messages() {
  const { t } = useLanguage();
  const user = getStoredUser();
  const [contacts, setContacts] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("");
  const [contactQuery, setContactQuery] = useState("");
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [showContactInfo, setShowContactInfo] = useState(false);
  const historyRef = useRef(null);

  const selected = useMemo(
    () => contacts.find((contact) => contact.id === selectedId) || null,
    [contacts, selectedId]
  );
  const visibleContacts = useMemo(() => contacts.filter((contact) => {
    const searchable = `${contact.name || ""} ${contact.email || ""} ${contact.roleLabel || ""} ${contact.schoolName || ""} ${contact.className || ""} ${contact.subjects || ""}`.toLowerCase();
    return searchable.includes(contactQuery.trim().toLowerCase())
      && (!showUnreadOnly || Number(contact.unreadCount || 0) > 0);
  }), [contactQuery, contacts, showUnreadOnly]);
  const unreadTotal = contacts.reduce((total, contact) => total + Number(contact.unreadCount || 0), 0);

  const loadContacts = useCallback(async () => {
    const response = await apiFetch("/api/messages/contacts");
    const data = await readApiJson(response, t.serverError);
    const next = data.success ? data.contacts || [] : [];
    setContacts(next);
    setSelectedId((current) => current || next[0]?.id || null);
    if (!data.success) setStatus(data.message || t.serverError);
  }, [t.serverError]);

  const loadMessages = useCallback(async () => {
    if (!selectedId) return;
    const response = await apiFetch(`/api/messages?contactId=${selectedId}`);
    const data = await readApiJson(response, t.serverError);
    setMessages(data.success ? data.messages || [] : []);
  }, [selectedId, t.serverError]);

  useEffect(() => {
    const timer = window.setTimeout(() => loadContacts().catch(() => setStatus(t.apiConnectionError)), 0);
    return () => window.clearTimeout(timer);
  }, [loadContacts, t.apiConnectionError]);

  useEffect(() => {
    const timer = window.setTimeout(() => loadMessages().catch(() => setStatus(t.apiConnectionError)), 0);
    const interval = window.setInterval(() => loadMessages().catch(() => {}), 5000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, [loadMessages, t.apiConnectionError]);

  useEffect(() => {
    historyRef.current?.scrollTo({ top: historyRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, selectedId]);

  useEffect(() => {
    const markNotificationsRead = async () => {
      try {
        const response = await apiFetch("/api/notifications");
        const data = await readApiJson(response, "");
        const unread = (data.notifications || []).filter((item) => !item.readAt && item.type === "message");
        await Promise.all(unread.map((item) => apiFetch(`/api/notifications/${item.id}/read`, { method: "PATCH" })));
      } catch {
        // Messaging remains usable when notification synchronization is offline.
      }
    };
    markNotificationsRead();
  }, []);

  const send = async (event) => {
    event?.preventDefault();
    const body = draft.trim();
    if (!body || !selectedId) return;
    const response = await apiFetch("/api/messages", {
      method: "POST",
      body: JSON.stringify({ recipientId: selectedId, body }),
    });
    const data = await readApiJson(response, t.serverError);
    if (data.success) {
      setDraft("");
      await loadMessages();
      return;
    }
    setStatus(data.message || t.serverError);
  };

  return (
    <LearnixLayout
      className="messages-page"
      title={t.messages}
      subtitle={t.messagesSubtitle || "Conversations pedagogiques liees a votre classe et votre ecole."}
    >
      {status && <div className="toast-notification warning-toast">{status}</div>}
      <section className="messages-workspace">
        <aside className="message-inbox">
          <div className="message-inbox-head">
            <div><h2>Conversations</h2><span>{contacts.length} contact(s)</span></div>
            {unreadTotal > 0 && <b>{unreadTotal} non lu(s)</b>}
          </div>

          <label className="message-search">
            <MessageIcon type="search" />
            <input value={contactQuery} onChange={(event) => setContactQuery(event.target.value)} placeholder="Rechercher un contact..." />
          </label>

          <div className="message-filter-row">
            <button className={!showUnreadOnly ? "active" : ""} type="button" onClick={() => setShowUnreadOnly(false)}>Tous</button>
            <button className={showUnreadOnly ? "active" : ""} type="button" onClick={() => setShowUnreadOnly(true)}>Non lus</button>
          </div>

          <div className="message-contact-list">
            {visibleContacts.map((contact) => (
              <button
                className={`message-teacher-card ${selectedId === contact.id ? "active" : ""}`}
                key={contact.id}
                type="button"
                onClick={() => setSelectedId(contact.id)}
              >
                <Avatar user={contact} name={contact.name} size={44} status={contact.isOnline ? "online" : "offline"} clickable />
                <span className="message-teacher-info">
                  <strong>{contact.name}</strong>
                  <small>{contactSummary(contact)}</small>
                  <em>{contact.email}</em>
                </span>
                {contact.unreadCount > 0 && <b className="learnix-nav-badge">{contact.unreadCount}</b>}
              </button>
            ))}
            {!visibleContacts.length && <div className="message-list-empty"><MessageIcon type="messages" /><p>Aucun contact ne correspond a ce filtre.</p></div>}
          </div>
        </aside>

        <article className="message-conversation">
          {selected ? (
            <>
              <div className="message-conversation-head">
                <Avatar user={selected} name={selected.name} size={52} status={selected.isOnline ? "online" : "offline"} clickable />
                <div>
                  <h3>{selected.name}</h3>
                  <p>{contactSummary(selected)}</p>
                  <small><i />{selected.isOnline ? " En ligne" : " Hors ligne"}</small>
                </div>
                <button type="button" aria-label="Informations du contact" onClick={() => setShowContactInfo((current) => !current)}><MessageIcon type="info" /></button>
              </div>

              {showContactInfo && <aside className="message-contact-details"><Avatar user={selected} name={selected.name} size={64} status={selected.isOnline ? "online" : "offline"} clickable /><strong>{selected.name}</strong><span>{selected.email}</span><span>{contactSummary(selected)}</span><button type="button" onClick={() => setShowContactInfo(false)}>Fermer</button></aside>}

              <div className="message-conversation-history" ref={historyRef}>
                {messages.map((message) => {
                  const own = message.senderId === user.id;
                  return (
                    <div className={`message-row ${own ? "own" : ""}`} key={message.id}>
                      <div className="message-bubble">
                        <p>{message.body}</p>
                        <small>{new Date(message.createdAt).toLocaleString()} {own && message.readAt ? " - Lu" : ""}</small>
                      </div>
                    </div>
                  );
                })}
                {!messages.length && <div className="message-empty-conversation"><MessageIcon type="messages" /><strong>Commencez la conversation</strong><p>Posez une question ou partagez une information pedagogique.</p></div>}
              </div>

              <form className="message-compose-form" onSubmit={send}>
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      send();
                    }
                  }}
                  placeholder={t.messagePlaceholder}
                />
                <button className="primary-action" type="submit" disabled={!draft.trim()}><MessageIcon type="send" /><span>{t.send}</span></button>
              </form>
            </>
          ) : <div className="message-empty-conversation"><MessageIcon type="messages" /><strong>Selectionnez une conversation</strong><p>Choisissez un contact pour afficher les messages.</p></div>}
        </article>
      </section>
    </LearnixLayout>
  );
}

function contactSummary(contact) {
  const details = [
    contact.roleLabel,
    contact.className,
    contact.schoolName,
  ].filter(Boolean);
  return details.join(" - ") || contact.subjects || contact.educationLevel || "Contact Learnix";
}

function MessageIcon({ type }) {
  const paths = {
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    messages: <><path d="M4 5h16v12H8l-4 4V5Z" /><path d="M8 9h8M8 13h5" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
    send: <><path d="m22 2-7 20-4-9-9-4 20-7Z" /><path d="M11 13 22 2" /></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[type]}</svg>;
}

export default Messages;
