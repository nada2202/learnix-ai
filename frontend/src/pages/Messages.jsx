import { useEffect, useMemo, useRef, useState } from "react";
import LearnixLayout from "../components/LearnixLayout";
import { useLanguage } from "../context/LanguageContext";
import { demoTeachers, teacherForUser } from "../data/demoTeachers";

const copy = {
  en: {
    title: "Messages",
    subtitle: "Keep student and teacher conversations organized inside Learnix AI.",
    panelStudent: "Student Panel",
    panelTeacher: "Teacher Panel",
    dashboard: "Dashboard",
    exercises: "Exercises",
    assistant: "AI Assistant",
    history: "History",
    courses: "Courses",
    quizManagement: "Quiz Management",
    studentResults: "Student Results",
    messages: "Messages",
    settings: "Settings",
    selectTeacher: "Choose a teacher",
    teacher: "Teacher",
    subject: "Subject",
    email: "Email",
    writeMessage: "Write a message",
    messagePlaceholder: "Ask your teacher a question...",
    replyPlaceholder: "Write a reply to the student...",
    send: "Send message",
    reply: "Reply",
    noMessages: "No messages in this conversation yet.",
    noThreads: "No student messages for this teacher yet.",
    student: "Student",
    read: "read",
    unread: "unread",
    openConversation: "Open conversation",
    search: "Search messages, students, teachers...",
  },
  fr: {
    title: "Messages",
    subtitle: "Centralisez les échanges entre élèves et enseignants dans Learnix AI.",
    panelStudent: "Espace élève",
    panelTeacher: "Espace enseignant",
    dashboard: "Tableau de bord",
    exercises: "Exercices",
    assistant: "Assistant IA",
    history: "Historique",
    courses: "Cours",
    quizManagement: "Gestion des quiz",
    studentResults: "Résultats des élèves",
    messages: "Messagerie",
    settings: "Paramètres",
    selectTeacher: "Choisir un enseignant",
    teacher: "Enseignant",
    subject: "Matière",
    email: "Adresse e-mail",
    writeMessage: "Écrire un message",
    messagePlaceholder: "Posez une question à votre enseignant...",
    replyPlaceholder: "Répondre à l'élève...",
    send: "Envoyer le message",
    reply: "Répondre",
    noMessages: "Aucun message dans cette conversation.",
    noThreads: "Aucun message d'élève pour cet enseignant.",
    student: "Élève",
    read: "lu",
    unread: "non lus",
    openConversation: "Ouvrir la conversation",
    search: "Rechercher des messages, élèves ou enseignants...",
  },
  ar: {
    title: "الرسائل",
    subtitle: "نظم محادثات الطلاب والمعلمين داخل Learnix AI.",
    panelStudent: "لوحة الطالب",
    panelTeacher: "لوحة المعلم",
    dashboard: "لوحة التحكم",
    exercises: "التمارين",
    assistant: "المساعد الذكي",
    history: "السجل",
    courses: "الدروس",
    quizManagement: "إدارة الاختبارات",
    studentResults: "نتائج الطلاب",
    messages: "الرسائل",
    settings: "الإعدادات",
    selectTeacher: "اختر معلما",
    teacher: "المعلم",
    subject: "المادة",
    email: "البريد الإلكتروني",
    writeMessage: "اكتب رسالة",
    messagePlaceholder: "اكتب سؤالك للمعلم...",
    replyPlaceholder: "اكتب ردا للطالب...",
    send: "إرسال الرسالة",
    reply: "رد",
    noMessages: "لا توجد رسائل في هذه المحادثة بعد.",
    noThreads: "لا توجد رسائل طلاب لهذا المعلم بعد.",
    student: "الطالب",
    unread: "غير مقروءة",
    openConversation: "فتح المحادثة",
    search: "ابحث في الرسائل والطلاب والمعلمين...",
  },
};

function readStorage(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value || fallback;
  } catch {
    return fallback;
  }
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function sortByDate(messages) {
  return [...messages].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

function formatTimestamp(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getInitials(nameOrEmail, fallback = "L") {
  const parts = String(nameOrEmail || fallback).trim().split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return String(parts[0] || fallback).slice(0, 2).toUpperCase();
}

function buildUnreadState(messages) {
  return messages.reduce((state, message) => {
    if (message.read) {
      return state;
    }

    if (message.recipientRole === "teacher") {
      const teacherEmail = normalizeText(message.teacherEmail);
      state.teachers[teacherEmail] = (state.teachers[teacherEmail] || 0) + 1;
    }

    if (message.recipientRole === "student") {
      const studentEmail = normalizeText(message.studentEmail);
      state.students[studentEmail] = (state.students[studentEmail] || 0) + 1;
    }

    return state;
  }, { teachers: {}, students: {} });
}

function Messages() {
  const { language, t } = useLanguage();
  const text = copy[language] || copy.en;
  const teacherUser = readStorage("teacherUser", {});
  const studentUser = readStorage("studentUser", {});
  const isTeacher = Boolean(teacherUser.email) && !studentUser.email;
  const teacherProfile = teacherForUser(teacherUser);
  const activeTeacher = {
    ...teacherProfile,
    ...teacherUser,
    email: teacherUser.email || teacherProfile.email,
    name: teacherUser.name || teacherProfile.name,
    subject: teacherUser.subject || teacherProfile.subject,
    section: teacherUser.section || teacherProfile.section,
  };
  const studentEmail = studentUser.email || "student@learnix.ai";
  const studentName = studentUser.name || t.studentFallback || text.student;
  const [messages, setMessages] = useState(() => readStorage("learnixMessages", []));
  const [selectedTeacherEmail, setSelectedTeacherEmail] = useState(demoTeachers[0].email);
  const [selectedStudentEmail, setSelectedStudentEmail] = useState("");
  const [draft, setDraft] = useState("");

  const saveUnreadState = (updatedMessages) => {
    localStorage.setItem("learnixMessageUnreadState", JSON.stringify(buildUnreadState(updatedMessages)));
  };

  useEffect(() => {
    const refreshMessages = () => {
      const storedMessages = readStorage("learnixMessages", []);
      setMessages(storedMessages);
      saveUnreadState(storedMessages);
    };
    window.addEventListener("storage", refreshMessages);
    window.addEventListener("learnixMessagesUpdated", refreshMessages);
    return () => {
      window.removeEventListener("storage", refreshMessages);
      window.removeEventListener("learnixMessagesUpdated", refreshMessages);
    };
  }, []);

  const teacherMessages = useMemo(() => (
    messages.filter((message) => normalizeText(message.teacherEmail) === normalizeText(activeTeacher.email))
  ), [activeTeacher.email, messages]);

  const rawUnreadCount = isTeacher
    ? teacherMessages.filter((message) => message.recipientRole === "teacher" && !message.read).length
    : messages.filter((message) => (
      normalizeText(message.studentEmail) === normalizeText(studentEmail) &&
      message.recipientRole === "student" &&
      !message.read
    )).length;
  const [unreadCount, setUnreadCount] = useState(rawUnreadCount);

  useEffect(() => {
    setUnreadCount(rawUnreadCount);
  }, [rawUnreadCount]);

  const selectedTeacher = demoTeachers.find(
    (teacher) => normalizeText(teacher.email) === normalizeText(selectedTeacherEmail)
  ) || demoTeachers[0];

  const studentConversation = sortByDate(messages.filter((message) => (
    normalizeText(message.studentEmail) === normalizeText(studentEmail) &&
    normalizeText(message.teacherEmail) === normalizeText(selectedTeacher.email)
  )));

  const teacherThreads = useMemo(() => {
    const groups = new Map();
    teacherMessages.forEach((message) => {
      const key = normalizeText(message.studentEmail);
      groups.set(key, [...(groups.get(key) || []), message]);
    });
    return [...groups.entries()].map(([email, thread]) => {
      const sortedThread = sortByDate(thread);
      return {
        email,
        studentName: sortedThread[0]?.studentName || text.student,
        unread: sortedThread.filter((message) => message.recipientRole === "teacher" && !message.read).length,
        thread: sortedThread,
      };
    });
  }, [teacherMessages, text.student]);

  useEffect(() => {
    if (isTeacher && !selectedStudentEmail && teacherThreads[0]?.email) {
      setSelectedStudentEmail(teacherThreads[0].email);
    }
  }, [isTeacher, selectedStudentEmail, teacherThreads]);

  const selectedTeacherThread = teacherThreads.find(
    (thread) => normalizeText(thread.email) === normalizeText(selectedStudentEmail)
  );

  const persistMessages = (updated) => {
    setMessages(updated);
    localStorage.setItem("learnixMessages", JSON.stringify(updated));
    saveUnreadState(updated);
    window.dispatchEvent(new Event("learnixMessagesUpdated"));
  };

  useEffect(() => {
    const updated = messages.map((message) => {
      const isRelevantTeacherMessage = isTeacher &&
        normalizeText(message.teacherEmail) === normalizeText(activeTeacher.email) &&
        message.recipientRole === "teacher";
      const isRelevantStudentMessage = !isTeacher &&
        normalizeText(message.studentEmail) === normalizeText(studentEmail) &&
        message.recipientRole === "student";

      return isRelevantTeacherMessage || isRelevantStudentMessage
        ? { ...message, read: true }
        : message;
    });
    const changed = updated.some((message, index) => message.read !== messages[index]?.read);

    if (changed) {
      setMessages(updated);
      localStorage.setItem("learnixMessages", JSON.stringify(updated));
      window.dispatchEvent(new Event("learnixMessagesUpdated"));
    }

    saveUnreadState(updated);
    setUnreadCount(0);
  }, [activeTeacher.email, isTeacher, studentEmail]);

  const markTeacherThreadRead = (studentEmailToRead) => {
    const updated = messages.map((message) => (
      normalizeText(message.teacherEmail) === normalizeText(activeTeacher.email) &&
      normalizeText(message.studentEmail) === normalizeText(studentEmailToRead) &&
      message.recipientRole === "teacher"
        ? { ...message, read: true }
        : message
    ));
    persistMessages(updated);
  };

  const sendStudentMessage = (event) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body) {
      return;
    }

    persistMessages([
      ...messages,
      {
        id: `msg-${Date.now()}`,
        teacherEmail: selectedTeacher.email,
        teacherName: selectedTeacher.name,
        studentEmail,
        studentName,
        senderRole: "student",
        recipientRole: "teacher",
        body,
        read: false,
        createdAt: new Date().toISOString(),
      },
    ]);
    setDraft("");
  };

  const sendTeacherReply = (event) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !selectedTeacherThread) {
      return;
    }

    const markedRead = messages.map((message) => (
      normalizeText(message.teacherEmail) === normalizeText(activeTeacher.email) &&
      normalizeText(message.studentEmail) === normalizeText(selectedTeacherThread.email) &&
      message.recipientRole === "teacher"
        ? { ...message, read: true }
        : message
    ));

    persistMessages([
      ...markedRead,
      {
        id: `msg-${Date.now()}`,
        teacherEmail: activeTeacher.email,
        teacherName: activeTeacher.name,
        studentEmail: selectedTeacherThread.email,
        studentName: selectedTeacherThread.studentName,
        senderRole: "teacher",
        recipientRole: "student",
        body,
        read: false,
        createdAt: new Date().toISOString(),
      },
    ]);
    setDraft("");
  };

  const navItems = isTeacher
    ? [
      { label: text.dashboard, path: "/teacher-dashboard", icon: "dashboard" },
      { label: text.courses, path: "/teacher-dashboard#courses", icon: "resources" },
      { label: text.quizManagement, path: "/teacher-dashboard#quizzes", icon: "exercises" },
      { label: text.studentResults, path: "/teacher-dashboard#students", icon: "history" },
      { label: text.messages, path: "/messages", icon: "messages" },
      { label: text.settings, path: "/settings", icon: "settings" },
    ]
    : [
      { label: text.dashboard, path: "/student-dashboard", icon: "dashboard" },
      { label: text.exercises, path: "/exercises", icon: "exercises" },
      { label: text.assistant, path: "/chatbot", icon: "chat" },
      { label: text.history, path: "/history", icon: "history" },
      { label: text.messages, path: "/messages", icon: "messages" },
      { label: text.settings, path: "/settings", icon: "settings" },
    ];

  return (
    <LearnixLayout
      className="messages-page"
      title={text.title}
      subtitle={text.subtitle}
      navItems={navItems}
      panelLabel={isTeacher ? text.panelTeacher : text.panelStudent}
      profileUser={isTeacher ? activeTeacher : studentUser}
      fallbackInitial={isTeacher ? "T" : "S"}
      fallbackName={isTeacher ? text.teacher : text.student}
      logoutPath={isTeacher ? "/teacher-login" : "/student-login"}
      hidePremiumCard={isTeacher}
      notificationCount={unreadCount}
      searchPlaceholder={text.search}
    >
      {isTeacher ? (
        <section className="messages-layout">
          <aside className="dash-card message-thread-list">
            <div className="teacher-card-head">
              <div>
                <span className="badge">{unreadCount} {text.unread}</span>
                <h3>{activeTeacher.name}</h3>
                <p>{activeTeacher.subject} / {activeTeacher.section}</p>
              </div>
            </div>
            {teacherThreads.map((thread) => (
              <button
                className={normalizeText(thread.email) === normalizeText(selectedStudentEmail) ? "active" : ""}
                key={thread.email}
                type="button"
                onClick={() => {
                  setSelectedStudentEmail(thread.email);
                  markTeacherThreadRead(thread.email);
                }}
              >
                <strong>{thread.studentName}</strong>
                <span>{thread.email}</span>
                {thread.unread > 0 && <small>{thread.unread}</small>}
              </button>
            ))}
            {teacherThreads.length === 0 && <p className="teacher-empty">{text.noThreads}</p>}
          </aside>

          <ConversationCard
            text={text}
            title={selectedTeacherThread?.studentName || text.student}
            meta={selectedTeacherThread?.email || ""}
            messages={selectedTeacherThread?.thread || []}
            draft={draft}
            setDraft={setDraft}
            onSubmit={sendTeacherReply}
            placeholder={text.replyPlaceholder}
            buttonLabel={text.reply}
            currentRole="teacher"
            currentUserName={activeTeacher.name}
            counterpartName={selectedTeacherThread?.studentName || text.student}
          />
        </section>
      ) : (
        <section className="messages-layout">
          <aside className="dash-card message-teacher-picker">
            <div className="message-picker-head">
              <span className="badge">{text.selectTeacher}</span>
            </div>
            <div className="message-teacher-grid">
              {demoTeachers.map((teacher) => {
                const active = normalizeText(teacher.email) === normalizeText(selectedTeacherEmail);

                return (
                  <button
                    className={`message-teacher-card ${active ? "active" : ""}`}
                    key={teacher.email}
                    type="button"
                    onClick={() => {
                      setSelectedTeacherEmail(teacher.email);
                      setDraft("");
                    }}
                  >
                    <Avatar label={teacher.name} role="teacher" />
                    <span className="message-teacher-info">
                      <strong>{teacher.name}</strong>
                      <small>{text.subject}: {teacher.subject}</small>
                      <small>{teacher.section}</small>
                      <em>{text.email}: {teacher.email}</em>
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <ConversationCard
            text={text}
            title={selectedTeacher.name}
            meta={`${selectedTeacher.subject} / ${selectedTeacher.email}`}
            messages={studentConversation}
            draft={draft}
            setDraft={setDraft}
            onSubmit={sendStudentMessage}
            placeholder={text.messagePlaceholder}
            buttonLabel={text.send}
            currentRole="student"
            currentUserName={studentName}
            counterpartName={selectedTeacher.name}
          />
        </section>
      )}
    </LearnixLayout>
  );
}

function ConversationCard({
  text,
  title,
  meta,
  messages,
  draft,
  setDraft,
  onSubmit,
  placeholder,
  buttonLabel,
  currentRole,
  currentUserName,
  counterpartName,
}) {
  const historyRef = useRef(null);

  useEffect(() => {
    historyRef.current?.scrollTo({
      top: historyRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length]);

  return (
    <article className="dash-card message-conversation-card">
      <div className="teacher-card-head message-conversation-head">
        <Avatar label={title} role={currentRole === "teacher" ? "student" : "teacher"} />
        <div>
          <span className="badge">{text.messages}</span>
          <h3>{title}</h3>
          {meta && <p>{meta}</p>}
        </div>
      </div>
      <div className="message-conversation-history" ref={historyRef}>
        {messages.map((message) => (
          <div
            className={`message-row ${message.senderRole === currentRole ? "own" : ""}`}
            key={message.id}
          >
            {message.senderRole !== currentRole && (
              <Avatar
                label={message.senderRole === "teacher" ? message.teacherName : message.studentName}
                role={message.senderRole}
              />
            )}
            <div className="message-bubble">
              <strong>
                {message.senderRole === currentRole
                  ? currentUserName || (message.senderRole === "teacher" ? message.teacherName : message.studentName)
                  : counterpartName || (message.senderRole === "teacher" ? message.teacherName : message.studentName)}
              </strong>
              <p>{message.body}</p>
              <small className="message-meta-line">
                <span>{formatTimestamp(message.createdAt)}</span>
                <span className={message.read ? "read-indicator read" : "read-indicator unread"}>
                  {message.read ? text.read : text.unread}
                </span>
              </small>
            </div>
            {message.senderRole === currentRole && (
              <Avatar
                label={currentUserName || (message.senderRole === "teacher" ? message.teacherName : message.studentName)}
                role={message.senderRole}
              />
            )}
          </div>
        ))}
        {messages.length === 0 && <p className="teacher-empty">{text.noMessages}</p>}
      </div>
      <form className="message-compose-form" onSubmit={onSubmit}>
        <label>
          <span>{text.writeMessage}</span>
          <textarea
            placeholder={placeholder}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>
        <button className="primary-action" type="submit">{buttonLabel}</button>
      </form>
    </article>
  );
}

function Avatar({ label, role }) {
  return (
    <span className={`message-avatar ${role === "teacher" ? "teacher" : "student"}`} aria-hidden="true">
      {getInitials(label, role === "teacher" ? "T" : "S")}
    </span>
  );
}

export default Messages;
