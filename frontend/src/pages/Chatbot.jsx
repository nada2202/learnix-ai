import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import LearnixLayout from "../components/LearnixLayout";
import { useLanguage } from "../context/LanguageContext";
import { apiErrorMessage, apiFetch, readApiJson } from "../services/api";
import { getStoredUser } from "../services/roles";
import studentRobotReference from "../assets/student-robot-reference.png";


const welcomeMessage = () => [{ role: "ai", textKey: "chatWelcome" }];

function localHistoryKey(user) {
  return `learnixLocalChatHistory:${user.id || user.email || "guest"}`;
}

function readLocalHistory(user) {
  try {
    return JSON.parse(localStorage.getItem(localHistoryKey(user)) || "[]");
  } catch {
    return [];
  }
}

function writeLocalHistory(user, conversations) {
  localStorage.setItem(localHistoryKey(user), JSON.stringify(conversations));
}

function parseConversationContext(value) {
  if (!value) return { lessonContext: "", moduleContext: null };
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && parsed.__learnixModuleContext === true) {
      return {
        lessonContext: parsed.lessonContext || "",
        moduleContext: parsed.moduleContext || null,
      };
    }
  } catch {
    // Old conversations stored plain lesson context.
  }
  return { lessonContext: value || "", moduleContext: null };
}

function serializeConversationContext(lessonContext, moduleContext) {
  if (!moduleContext?.moduleId && !moduleContext?.moduleName) return lessonContext || "";
  return JSON.stringify({
    __learnixModuleContext: true,
    lessonContext: lessonContext || "",
    moduleContext,
  });
}

function moduleContextFromModule(module) {
  if (!module) return null;
  return {
    moduleId: module.id || module.moduleId || "",
    moduleName: module.name || module.moduleName || "",
    teacherId: module.teacherId || "",
    teacherName: module.teacherName || "",
    classId: module.classId || "",
    className: module.className || "",
    schoolId: module.schoolId || "",
  };
}

function moduleContextFromAssigned(moduleId, modules) {
  if (!moduleId) return null;
  const module = modules.find((item) => String(item.id || item.moduleId) === String(moduleId));
  return module ? moduleContextFromModule(module) : null;
}

function conversationModuleContext(conversation, modules = []) {
  const parsedContext = parseConversationContext(conversation?.context || "").moduleContext || null;
  const directContext = {
    moduleId: conversation?.moduleId || conversation?.module_id || parsedContext?.moduleId || "",
    moduleName: conversation?.moduleName || conversation?.module_name || parsedContext?.moduleName || "",
    teacherId: conversation?.teacherId || conversation?.teacher_id || parsedContext?.teacherId || "",
    teacherName: conversation?.teacherName || conversation?.teacher_name || parsedContext?.teacherName || "",
    classId: conversation?.classId || conversation?.class_id || parsedContext?.classId || "",
    className: conversation?.className || conversation?.class_name || parsedContext?.className || "",
    schoolId: conversation?.schoolId || conversation?.school_id || parsedContext?.schoolId || "",
  };
  const assignedContext = moduleContextFromAssigned(directContext.moduleId, modules);
  if (assignedContext) return { ...assignedContext, ...directContext, moduleName: directContext.moduleName || assignedContext.moduleName };
  return directContext.moduleId || directContext.moduleName ? directContext : null;
}

function moduleBadgeLabel(conversation, modules = []) {
  const moduleContext = conversationModuleContext(conversation, modules);
  return moduleContext?.moduleName || (moduleContext?.moduleId ? `Module ${moduleContext.moduleId}` : "Général");
}

function Chatbot() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const user = useMemo(() => getStoredUser(), []);
  const { language, t } = useLanguage();
  const selectedModuleId = searchParams.get("moduleId") || "";
  const [assignedModules, setAssignedModules] = useState([]);
  const [selectedModule, setSelectedModule] = useState(null);
  const [activeModuleContext, setActiveModuleContext] = useState(null);
  const [historyFilter, setHistoryFilter] = useState("all");
  const [historyFilterOpen, setHistoryFilterOpen] = useState(false);
  const [moduleWarning, setModuleWarning] = useState("");
  const [moduleConfirmation, setModuleConfirmation] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState(welcomeMessage);
  const [input, setInput] = useState("");
  const [context, setContext] = useState("");
  const [pendingFile, setPendingFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [stream, setStream] = useState(null);
  const [toast, setToast] = useState("");
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const loadModules = async () => {
      try {
        const response = await apiFetch("/api/student/profile");
        const data = await readApiJson(response, t.serverError);
        if (cancelled) return;
        const modules = Array.isArray(data?.modules) ? data.modules : [];
        setAssignedModules(modules);
        if (!selectedModuleId) {
          setSelectedModule(null);
          if (!conversationId) setActiveModuleContext(null);
          setModuleWarning("");
          return;
        }
        const module = modules.find((item) => String(item.id) === String(selectedModuleId)) || null;
        setSelectedModule(module);
        if (!conversationId) {
          setActiveModuleContext(module ? moduleContextFromModule(module) : null);
        }
        setModuleWarning(module ? "" : "Ce module n'est pas attribué à votre compte.");
      } catch {
        if (!cancelled) setModuleWarning("Impossible de valider le module sélectionné.");
      }
    };
    loadModules();
    return () => {
      cancelled = true;
    };
  }, [conversationId, selectedModuleId, t.serverError]);

  const refreshConversations = useCallback(async () => {
    const localConversations = readLocalHistory(user);
    try {
      const response = await apiFetch("/api/ai/conversations");
      const data = await readApiJson(response, t.serverError);
      if (data.status === 401) {
        setToast(language === "fr"
          ? "Votre session a expiré. Les nouvelles conversations restent enregistrées localement; reconnectez-vous pour retrouver l'historique serveur."
          : "Your session expired. New chats are saved locally; sign in again to restore server history.");
      }
      setConversations(data.success ? [...localConversations, ...(data.conversations || [])] : localConversations);
    } catch {
      setConversations(localConversations);
    }
  }, [language, t.serverError, user]);

  useEffect(() => {
    const timer = window.setTimeout(() => refreshConversations().catch(() => {}), 0);
    return () => window.clearTimeout(timer);
  }, [refreshConversations]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading, uploading]);

  const stopCamera = useCallback(() => {
    if (stream) stream.getTracks().forEach((track) => track.stop());
    setStream(null);
  }, [stream]);

  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const selectedAssessmentModule = () => (selectedModule?.id || selectedModuleId ? {
    moduleId: selectedModule?.id || selectedModuleId,
    moduleName: selectedModule?.name || "",
    teacherId: selectedModule?.teacherId || "",
    teacherName: selectedModule?.teacherName || "",
    classId: selectedModule?.classId || "",
    className: selectedModule?.className || "",
    schoolId: selectedModule?.schoolId || "",
  } : null);

  const currentModuleContext = () => {
    if (conversationId) return activeModuleContext;
    return selectedAssessmentModule() || activeModuleContext;
  };

  const withAssessmentModule = (request) => (request ? {
    ...request,
    moduleContext: request.moduleContext || currentModuleContext(),
  } : null);

  const newConversation = () => {
    setConversationId(null);
    setMessages(welcomeMessage());
    setContext("");
    setActiveModuleContext(moduleContextFromModule(selectedModule) || (selectedModuleId ? activeModuleContext : null));
    setInput("");
    clearPendingFile();
  };

  const loadConversation = async (id) => {
    if (loading) return;
    if (String(id).startsWith("local-")) {
      const conversation = readLocalHistory(user).find((item) => item.id === id);
      if (!conversation) return;
      const parsedContext = parseConversationContext(conversation.context || "");
      setConversationId(id);
      setMessages(conversation.messages?.length ? conversation.messages : welcomeMessage());
      setContext(parsedContext.lessonContext || "");
      setActiveModuleContext(conversationModuleContext(conversation, assignedModules));
      setInput("");
      clearPendingFile();
      return;
    }
    const response = await apiFetch(`/api/ai/conversations/${id}`);
    const data = await readApiJson(response, t.serverError);
    if (!data.success) return;
    const parsedContext = parseConversationContext(data.conversation?.context || "");
    setConversationId(id);
    setMessages(data.messages?.length ? data.messages : welcomeMessage());
    setContext(parsedContext.lessonContext || "");
    setActiveModuleContext(conversationModuleContext(data.conversation, assignedModules));
    setInput("");
    clearPendingFile();
  };

  const deleteConversation = async (event, id) => {
    event.stopPropagation();
    if (String(id).startsWith("local-")) {
      writeLocalHistory(user, readLocalHistory(user).filter((item) => item.id !== id));
    } else {
      await apiFetch(`/api/ai/conversations/${id}`, { method: "DELETE" });
    }
    if (conversationId === id) newConversation();
    await refreshConversations();
  };

  const ensureConversation = async (conversationContext = context) => {
    if (conversationId) return conversationId;
    const storedContext = serializeConversationContext(conversationContext, currentModuleContext());
    try {
      const response = await apiFetch("/api/ai/conversations", {
        method: "POST",
        body: JSON.stringify({ context: storedContext }),
      });
      const data = await readApiJson(response, t.serverError);
      if (!data.success) throw new Error(data.message || t.serverError);
      setConversationId(data.conversationId);
      return data.conversationId;
    } catch {
      const localId = `local-${Date.now()}`;
      const localConversation = {
        id: localId,
        title: language === "fr" ? "Nouvelle conversation" : "New conversation",
        context: storedContext,
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      writeLocalHistory(user, [localConversation, ...readLocalHistory(user)]);
      setConversationId(localId);
      return localId;
    }
  };

  const persistMessage = async (id, message) => {
    if (!id) return;
    const moduleContext = currentModuleContext();
    const messageToPersist = moduleContext ? { ...message, moduleContext } : message;
    if (String(id).startsWith("local-")) {
      const updated = readLocalHistory(user).map((conversation) => conversation.id === id
        ? { ...conversation, messages: [...(conversation.messages || []), messageToPersist], updatedAt: new Date().toISOString() }
        : conversation);
      writeLocalHistory(user, updated);
      return;
    }
    try {
      await apiFetch(`/api/ai/conversations/${id}/messages`, {
        method: "POST",
        body: JSON.stringify(messageToPersist),
      });
    } catch {
      // Conversation history must never block the assistant response.
    }
  };

  const prepareAttachment = async (file) => {
    if (!file) return;
    clearPendingFile();
    setMediaOpen(false);
    setPendingFile({
      file,
      name: file.name,
      type: file.type.startsWith("image/") ? "image" : "pdf",
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : "",
    });
  };

  const clearPendingFile = () => {
    setPendingFile((current) => {
      if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl);
      return null;
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const uploadPendingAttachment = async (moduleChoice = "") => {
    if (!pendingFile) return { nextContext: context, fileCard: null };
    const formData = new FormData();
    formData.append("file", pendingFile.file);
    formData.append("language", language);
    const moduleContext = currentModuleContext();
    if (moduleContext?.moduleId) formData.append("moduleId", moduleContext.moduleId);
    else if (!conversationId && selectedModuleId) formData.append("moduleId", selectedModuleId);
    if (moduleChoice) formData.append("moduleChoice", moduleChoice);
    setUploading(true);
    try {
      const response = await apiFetch("/chatbot-upload", { method: "POST", body: formData });
      const data = await readApiJson(response, t.chatUploadFailed);
      if (!data.success) throw new Error(data.message || t.chatUploadFailed);
      if (data.requiresModuleConfirmation) {
        setModuleConfirmation(data.moduleValidation || {});
        return { needsConfirmation: true };
      }
      if (data.unassignedSubject) {
        return {
          unassignedSubject: true,
          notice: data.message || "Cette matière ne fait pas partie de vos modules attribués. Aucun enseignant référent n'existe pour cette matière.",
          nextContext: context,
          fileCard: {
            name: pendingFile.name,
            type: pendingFile.type,
            pages: data.pageCount ?? null,
            status: t.uploadReadyStatus,
          },
        };
      }
      return {
        // A newly attached document replaces earlier document context. This
        // prevents a quiz from silently using a PDF from another request.
        nextContext: data.context || "",
        fileCard: {
          name: pendingFile.name,
          type: pendingFile.type,
          pages: data.pageCount ?? null,
          status: t.uploadReadyStatus,
        },
      };
    } finally {
      setUploading(false);
    }
  };

  const sendQuestion = async (options = {}) => {
    const typedMessage = input.trim();
    if ((!typedMessage && !pendingFile) || loading) return;
    const message = typedMessage || (language === "fr" ? "Analyse ce document et explique les points importants." : "Analyze this document and explain the important points.");
    setLoading(true);
    try {
      const uploadResult = await uploadPendingAttachment(options.moduleChoice || "");
      if (uploadResult?.needsConfirmation) return;
      const { nextContext, fileCard } = uploadResult;
      const id = await ensureConversation(nextContext);
      const studentMessage = { role: "student", text: message, fileCard };
      setMessages((current) => [...current, studentMessage]);
      setInput("");
      setContext(nextContext);
      clearPendingFile();
      await persistMessage(id, studentMessage);
      if (uploadResult?.unassignedSubject) {
        const aiMessage = { role: "ai", text: uploadResult.notice };
        setMessages((current) => [...current, aiMessage]);
        await persistMessage(id, aiMessage);
        await refreshConversations().catch(() => {});
        return;
      }

      const response = await apiFetch("/chatbot", {
        method: "POST",
        body: JSON.stringify({
          message,
          language,
          context: nextContext,
          userId: user.id || null,
          generateTitle: messages.length <= 1,
          moduleContext: currentModuleContext(),
        }),
      });
      const data = await readApiJson(response, t.chatError);
      const difficultyRequest = withAssessmentModule(data.success && data.responseType === "difficulty_required" ? data.assessmentRequest : null);
      const questionCountRequest = withAssessmentModule(data.success && data.responseType === "question_count_required" ? data.assessmentRequest : null);
      const aiMessage = {
        role: "ai",
        text: data.success ? data.answer : data.message || t.chatError,
        quiz: data.success && data.responseType === "assessment" ? data.quiz : null,
        difficultyRequest,
        questionCountRequest,
        summaryReport: data.success && data.responseType === "summary" ? {
          title: data.conversationTitle || "Résumé Learnix AI",
          summary: data.answer,
          studentName: user.name || user.email || "Student",
          language,
        } : null,
      };
      setMessages((current) => [...current, aiMessage]);
      await persistMessage(id, aiMessage);
      if (id) {
        const patch = { context: serializeConversationContext(nextContext, currentModuleContext()) };
        if (data.conversationTitle) patch.title = data.conversationTitle;
        if (String(id).startsWith("local-")) {
          const updated = readLocalHistory(user).map((conversation) => conversation.id === id
            ? { ...conversation, ...patch, updatedAt: new Date().toISOString() }
            : conversation);
          writeLocalHistory(user, updated);
        } else {
          await apiFetch(`/api/ai/conversations/${id}`, { method: "PATCH", body: JSON.stringify(patch) }).catch(() => {});
        }
        await refreshConversations().catch(() => {});
      }
    } catch (error) {
      setMessages((current) => [...current, { role: "ai", text: error?.message || apiErrorMessage(error, t) || t.chatError }]);
    } finally {
      setLoading(false);
    }
  };

  const confirmModuleImport = async (choice) => {
    if (choice === "switch_detected" && moduleConfirmation?.detectedModule?.id) {
      const detected = assignedModules.find((item) => String(item.id) === String(moduleConfirmation.detectedModule.id));
      if (detected) {
        setSelectedModule(detected);
        setActiveModuleContext(moduleContextFromModule(detected));
        navigate(`/chatbot?moduleId=${encodeURIComponent(detected.id)}`, { replace: true });
      }
    }
    setModuleConfirmation(null);
    await sendQuestion({ moduleChoice: choice });
  };

  const startVoiceInput = () => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setToast(t.voiceUnsupported);
      return;
    }
    const recognition = new Recognition();
    recognition.lang = language === "fr" ? "fr-FR" : language === "ar" ? "ar-SA" : "en-US";
    recognition.onresult = (event) => setInput((current) => `${current} ${event.results[0][0].transcript}`.trim());
    recognition.start();
  };

  const continueAssessmentSetup = async (request, options = {}) => {
    if (!request || loading) return;
    setLoading(true);
    try {
      const response = await apiFetch("/chatbot", {
        method: "POST",
        body: JSON.stringify({
          message: request.message,
          language,
          context,
          userId: user.id || null,
          difficulty: options.difficulty || request.difficulty,
          numQuestions: options.numQuestions || request.numQuestions,
          moduleContext: request.moduleContext || currentModuleContext(),
        }),
      });
      const data = await readApiJson(response, t.chatError);
      const difficultyRequest = withAssessmentModule(data.success && data.responseType === "difficulty_required" ? data.assessmentRequest : null);
      const questionCountRequest = withAssessmentModule(data.success && data.responseType === "question_count_required" ? data.assessmentRequest : null);
      const aiMessage = {
        role: "ai",
        text: data.success ? data.answer : data.message || t.chatError,
        quiz: data.success && data.responseType === "assessment" ? data.quiz : null,
        difficultyRequest,
        questionCountRequest,
      };
      setMessages((current) => [...current, aiMessage]);
      if (conversationId) await persistMessage(conversationId, aiMessage);
      await refreshConversations();
    } catch (error) {
      setMessages((current) => [...current, { role: "ai", text: error?.message || apiErrorMessage(error, t) || t.chatError }]);
    } finally {
      setLoading(false);
    }
  };

  const downloadSummary = async (report) => {
    const response = await apiFetch("/download-summary-pdf", {
      method: "POST",
      body: JSON.stringify({ ...report, language }),
    });
    if (!response.ok) return;
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "learnix-summary.pdf";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const openCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
      setStream(mediaStream);
      setCameraError("");
    } catch {
      setCameraError(t.cameraUnsupported);
    }
    setCameraOpen(true);
    setMediaOpen(false);
  };

  const closeCamera = () => {
    stopCamera();
    setCameraOpen(false);
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth || 960;
    canvas.height = video.videoHeight || 540;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (blob) prepareAttachment(new File([blob], "camera-lesson.png", { type: "image/png" }));
      closeCamera();
    }, "image/png");
  };

  const openGeneratedQuiz = (quiz) => {
    sessionStorage.setItem("learnixGeneratedQuiz", JSON.stringify(quiz));
    navigate("/assessment", { state: { generatedQuiz: quiz, assessmentType: quiz.assessmentType || "quiz" } });
  };

  const displayedModuleContext = currentModuleContext();
  const selectedHistoryFilterLabel = historyFilter === "all"
    ? "Toutes les matières"
    : moduleContextFromAssigned(historyFilter, assignedModules)?.moduleName || "Module";
  const filteredConversations = useMemo(() => {
    if (historyFilter === "all") return conversations;
    return conversations.filter((conversation) => {
      const moduleContext = conversationModuleContext(conversation, assignedModules);
      return String(moduleContext?.moduleId || "") === String(historyFilter);
    });
  }, [assignedModules, conversations, historyFilter]);

  return (
    <LearnixLayout className="learnix-chat-page" title={t.chatbotTitle} subtitle={t.chatbotSubtitle}>
      <section className="learnix-chat-workbench">
        <aside className="learnix-chat-history">
          <button className="chat-new-button" type="button" onClick={newConversation}>+ Nouvelle conversation</button>
          <div className="chat-history-filter" aria-label="Filtrer les conversations">
            <button
              className="chat-history-filter-trigger"
              type="button"
              aria-expanded={historyFilterOpen}
              onClick={() => setHistoryFilterOpen((open) => !open)}
            >
              <span>{selectedHistoryFilterLabel}</span>
              <i aria-hidden="true">⌄</i>
            </button>
            {historyFilterOpen && (
              <div className="chat-history-filter-menu">
                <button
                  className={historyFilter === "all" ? "active" : ""}
                  type="button"
                  onClick={() => {
                    setHistoryFilter("all");
                    setHistoryFilterOpen(false);
                  }}
                >
                  Toutes les matières
                </button>
              {assignedModules.map((module) => {
                const moduleContext = moduleContextFromModule(module);
                const moduleId = String(moduleContext.moduleId || "");
                return (
                  <button
                    className={historyFilter === moduleId ? "active" : ""}
                    type="button"
                    key={moduleId || moduleContext.moduleName}
                    title={moduleContext.moduleName}
                    onClick={() => {
                      setHistoryFilter(moduleId);
                      setHistoryFilterOpen(false);
                    }}
                  >
                    {moduleContext.moduleName || "Module"}
                  </button>
                );
              })}
              </div>
            )}
          </div>
          <div className="chat-history-list">
            {filteredConversations.map((conversation) => (
              <button className={conversationId === conversation.id ? "active" : ""} type="button" key={conversation.id} onClick={() => loadConversation(conversation.id)}>
                <span>{conversation.title}</span>
                <b className="chat-module-badge" title={moduleBadgeLabel(conversation, assignedModules)}>
                  📘 {moduleBadgeLabel(conversation, assignedModules)}
                </b>
                <small>{new Date(conversation.updatedAt).toLocaleDateString()}</small>
                <i role="button" tabIndex="0" aria-label="Supprimer" onClick={(event) => deleteConversation(event, conversation.id)}>×</i>
              </button>
            ))}
            {!filteredConversations.length && (
              <p>{conversations.length ? "Aucune conversation pour ce filtre." : "Aucune conversation enregistrée."}</p>
            )}
          </div>
        </aside>

        <section className="learnix-chat-shell">
          {(displayedModuleContext || moduleWarning) && (
            <div className="assistant-module-context">
              <div className="assistant-module-row">
                <div className="assistant-module-copy">
                  <span aria-hidden="true">📘</span>
                  <div>
                    <strong title={displayedModuleContext?.moduleName || moduleWarning}>
                      {displayedModuleContext?.moduleName || moduleWarning}
                    </strong>
                    <small>Assistant IA spécialisé pour ce module</small>
                  </div>
                </div>
                {displayedModuleContext?.teacherName && (
                  <div className="assistant-module-meta">
                    <span>👨‍🏫</span>
                    <b title={displayedModuleContext.teacherName}>{displayedModuleContext.teacherName}</b>
                  </div>
                )}
                {(displayedModuleContext?.className || displayedModuleContext?.classId) && (
                  <div className="assistant-module-meta">
                    <span>🏫</span>
                    <b title={displayedModuleContext.className || String(displayedModuleContext.classId)}>
                      {displayedModuleContext.className || displayedModuleContext.classId}
                    </b>
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="learnix-chat-window">
            {messages.map((message, index) => (
              <div className={`learnix-message-row ${message.role}`} key={`${message.role}-${message.id || index}`}>
                {message.role === "ai" && <span className="message-avatar"><img src={studentRobotReference} alt="" aria-hidden="true" /></span>}
                <div className="learnix-message-bubble">
                  {message.fileCard && <AttachmentCard attachment={message.fileCard} t={t} />}
                  <div className="message-content">{message.textKey ? t[message.textKey] : message.text}</div>
                  {message.difficultyRequest && (
                    <div className="assistant-difficulty-card">
                      <strong>{message.difficultyRequest.assessmentType === "exam" ? "Difficulté de l'examen" : "Difficulté du quiz"}</strong>
                      <p>Choisissez un niveau pour générer une évaluation adaptée.</p>
                      <div>
                        <button type="button" onClick={() => continueAssessmentSetup(message.difficultyRequest, { difficulty: "Easy" })}>Facile</button>
                        <button type="button" onClick={() => continueAssessmentSetup(message.difficultyRequest, { difficulty: "Medium" })}>Moyen</button>
                        <button type="button" onClick={() => continueAssessmentSetup(message.difficultyRequest, { difficulty: "Hard" })}>Difficile</button>
                      </div>
                    </div>
                  )}
                  {message.questionCountRequest && (
                    <QuestionCountCard
                      language={language}
                      onSelect={(count) => continueAssessmentSetup(message.questionCountRequest, { numQuestions: count })}
                    />
                  )}
                  {message.quiz && (
                    <div className="assistant-quiz-card">
                      <strong>{message.quiz.assessmentType === "exam" ? "Examen généré" : "Quiz généré"}</strong>
                      <span>{message.quiz.exercises?.length || 0} {t.questionCount}</span>
                      <button type="button" onClick={() => openGeneratedQuiz(message.quiz)}>
                        {message.quiz.assessmentType === "exam" ? "Passer l'examen" : t.startQuiz}
                      </button>
                    </div>
                  )}
                  {message.summaryReport && (
                    <button className="summary-download-button" type="button" onClick={() => downloadSummary(message.summaryReport)}>
                      Télécharger le résumé en PDF
                    </button>
                  )}
                </div>
              </div>
            ))}
            {(loading || uploading) && (
              <div className="learnix-message-row ai"><span className="message-avatar"><img src={studentRobotReference} alt="" aria-hidden="true" /></span><div className="learnix-message-bubble loading-bubble">{uploading ? t.uploadingStatus : t.aiThinking}</div></div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="learnix-composer">
            <input ref={fileInputRef} type="file" accept="application/pdf" hidden onChange={(event) => prepareAttachment(event.target.files[0])} />
            <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={(event) => prepareAttachment(event.target.files[0])} />
            {pendingFile && (
              <div className="pending-attachment">
                {pendingFile.previewUrl ? <img src={pendingFile.previewUrl} alt="" /> : <PdfIcon />}
                <div><strong>{pendingFile.name}</strong><small>Prêt à être envoyé</small></div>
                <button type="button" onClick={clearPendingFile} aria-label="Retirer le fichier">×</button>
              </div>
            )}
            <div className="composer-input-row">
              <textarea value={input} placeholder={t.chatPlaceholder} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendQuestion(); }
              }} />
              <div className="learnix-composer-actions">
                <div className="learnix-media-menu">
                  <button className="learnix-icon-button" type="button" aria-label="Media" onClick={() => setMediaOpen((value) => !value)}><MediaIcon /></button>
                  {mediaOpen && <div className="learnix-media-popover">
                    <button type="button" onClick={() => fileInputRef.current?.click()}><PdfIcon />{t.uploadPdf}</button>
                    <button type="button" onClick={() => imageInputRef.current?.click()}><ImageIcon />{t.uploadImage}</button>
                    <button type="button" onClick={openCamera}><CameraIcon />{t.takePhoto}</button>
                    <button type="button" onClick={startVoiceInput}><MicIcon />{t.microphone}</button>
                  </div>}
                </div>
                <button className="learnix-send-button" type="button" onClick={sendQuestion} disabled={loading || (!input.trim() && !pendingFile)} aria-label={t.send}><SendIcon /></button>
              </div>
            </div>
          </div>
        </section>
      </section>

      {cameraOpen && <div className="camera-modal"><div className="camera-card"><div className="camera-header"><h2>{t.takePhoto}</h2><button onClick={closeCamera}>{t.back}</button></div>{cameraError ? <p>{cameraError}</p> : <video ref={videoRef} autoPlay playsInline />}<canvas ref={canvasRef} hidden /><div className="quiz-actions"><button onClick={capturePhoto} disabled={Boolean(cameraError)}>{t.capture}</button><button className="secondary-action" onClick={closeCamera}>{t.back}</button></div></div></div>}
      {moduleConfirmation && (
        <div className="camera-modal">
          <div className="camera-card assistant-module-confirmation">
            <div className="camera-header">
              <h2>Vérification du module</h2>
              <button type="button" onClick={() => setModuleConfirmation(null)}>Fermer</button>
            </div>
            <p>
              Ce document semble concerner « {moduleConfirmation.detectedModule?.name || "un autre module"} » plutôt que « {moduleConfirmation.selectedModule?.name || selectedModule?.name || "le module sélectionné"} ».
            </p>
            <div className="quiz-actions">
              {moduleConfirmation.detectedModuleAssigned !== false && moduleConfirmation.detectedModule?.id && (
                <button type="button" onClick={() => confirmModuleImport("switch_detected")}>
                  Changer vers {moduleConfirmation.detectedModule.name}
                </button>
              )}
              <button type="button" onClick={() => confirmModuleImport("keep_selected")}>
                Conserver {moduleConfirmation.selectedModule?.name || selectedModule?.name || "le module sélectionné"}
              </button>
              <button className="secondary-action" type="button" onClick={() => setModuleConfirmation(null)}>
                Annuler l'import
              </button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="toast-notification warning-toast">{toast}</div>}
    </LearnixLayout>
  );
}

function AttachmentCard({ attachment, t }) {
  return <div className="learnix-chat-file-card"><PdfIcon /><div><strong>{attachment.name}</strong><small>{attachment.status || t.uploadReadyStatus}{attachment.pages ? ` · ${attachment.pages} ${t.pages}` : ""}</small></div></div>;
}

function QuestionCountCard({ language, onSelect }) {
  const [count, setCount] = useState(5);
  const labels = language === "fr"
    ? { title: "Nombre de questions", text: "Combien de questions souhaitez-vous ?", custom: "Générer" }
    : language === "ar"
      ? { title: "عدد الأسئلة", text: "كم عدد الأسئلة التي تريدها؟", custom: "إنشاء" }
      : { title: "Number of questions", text: "How many questions would you like?", custom: "Generate" };
  return (
    <div className="assistant-difficulty-card assistant-question-count-card">
      <strong>{labels.title}</strong>
      <p>{labels.text}</p>
      <div>
        {[3, 5, 8, 10].map((value) => (
          <button key={value} type="button" onClick={() => onSelect(value)}>{value}</button>
        ))}
      </div>
      <label className="assistant-custom-count">
        <input type="number" min="1" max="10" value={count} onChange={(event) => setCount(Math.max(1, Math.min(10, Number(event.target.value) || 1)))} />
        <button type="button" onClick={() => onSelect(count)}>{labels.custom}</button>
      </label>
    </div>
  );
}

function PdfIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h6l4 4v14H7z" /><path d="M13 3v5h4" /><path d="M8.8 16.5h6.4M8.8 13.2h6.4" /></svg>; }
function ImageIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="3" /><path d="m7 16 3.2-3.2 2.4 2.4 2-2L19 17" /><circle cx="9" cy="9" r="1.4" /></svg>; }
function CameraIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 7 10 5h4l1.5 2H18a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z" /><circle cx="12" cy="12.8" r="3.2" /></svg>; }
function MicIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6" /></svg>; }
function SendIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 12 16-8-5 16-3.2-6.2z" /><path d="m11.8 13.8 3.7-4.2" /></svg>; }
function MediaIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /><circle cx="12" cy="12" r="9" /></svg>; }
function ModuleContextIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 5.5A2.5 2.5 0 0 1 7 3h12v16H7a2.5 2.5 0 0 0-2.5 2.5v-16Z" /><path d="M7 17h12M8 7h7M8 10h5" /></svg>; }

export default Chatbot;
