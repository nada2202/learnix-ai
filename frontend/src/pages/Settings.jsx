import { useEffect, useState } from "react";
import LearnixLayout from "../components/LearnixLayout";
import Avatar from "../components/Avatar";
import { useLanguage } from "../context/LanguageContext";
import { useTheme } from "../context/ThemeContext";
import { getStoredUser, isStudentRole, normalizeRole, panelLabelForRole, roleLabel, storageKeyForRole } from "../services/roles";
import { apiFetch, readApiJson, updateStoredUser } from "../services/api";

const STATUS_LABELS = {
  active: "Actif",
  approved: "Approuvé",
  pending: "En attente",
  disabled: "Inactif",
  inactive: "Inactif",
  rejected: "Refusé",
};

function Settings() {
  const { language, setLanguage, t } = useLanguage();
  const { theme, setTheme } = useTheme();
  const [passwordMessage, setPasswordMessage] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [levels, setLevels] = useState([]);
  const [schools, setSchools] = useState([]);
  const [classes, setClasses] = useState([]);
  const [requestedSchoolId, setRequestedSchoolId] = useState("");
  const [requestedClassId, setRequestedClassId] = useState("");
  const [activeSection, setActiveSection] = useState("profile");
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmation: "" });
  const user = getStoredUser();
  const role = normalizeRole(user.role || user.level);
  const isStudent = isStudentRole(role);
  const [profile, setProfile] = useState({
    name: user.name || "",
    email: user.email || "",
    phone: user.phone || "",
    educationLevel: user.educationLevel || "",
    birthDate: "",
    guardianName: "",
    guardianPhone: "",
    preferredLanguage: language,
    learningStyle: "",
    interests: "",
    notes: "",
    schoolName: "",
    className: "",
    avatar_url: user.avatar_url || "",
  });

  const refreshCurrentProfile = async () => {
    const response = await apiFetch("/api/me");
    const data = await readApiJson(response, "");
    if (!data.success || !data.user) {
      throw new Error(data.message || t.serverError);
    }
    const nextProfile = {
      ...data.user,
      phone: data.user.phone || "",
      schoolName: data.user.schoolName || "",
    };
    setProfile((current) => ({ ...current, ...nextProfile }));
    updateStoredUser(nextProfile);
    return nextProfile;
  };

  useEffect(() => {
    if (!isStudent) return;
    Promise.all([apiFetch("/api/student/profile"), apiFetch("/api/levels"), apiFetch("/api/schools"), apiFetch("/api/classes")])
      .then(async (responses) => Promise.all(responses.map((response) => readApiJson(response, ""))))
      .then(([data, levelsData, schoolsData, classesData]) => {
        if (data.success && data.profile) {
          setProfile((current) => ({
            ...current,
            ...data.profile,
            birthDate: data.profile.birthDate?.slice?.(0, 10) || "",
            interests: (data.profile.interests || []).join(", "),
          }));
        }
        if (levelsData.success) setLevels(levelsData.levels || []);
        if (schoolsData.success) setSchools(schoolsData.schools || []);
        if (classesData.success) setClasses(classesData.classes || []);
      })
      .catch(() => setProfileMessage(t.apiConnectionError));
  }, [isStudent, t.apiConnectionError]);

  useEffect(() => {
    if (isStudent) return;
    const timer = window.setTimeout(async () => {
      try {
        await refreshCurrentProfile();
      } catch {
        setProfileMessage(t.apiConnectionError);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isStudent, t.apiConnectionError]);

  useEffect(() => {
    const refreshProfile = async () => {
      if (!isStudent) return;
      const response = await apiFetch("/api/student/profile");
      const data = await readApiJson(response, "");
      if (data.success && data.profile) setProfile((current) => ({ ...current, ...data.profile, birthDate: data.profile.birthDate?.slice?.(0, 10) || "", interests: (data.profile.interests || []).join(", ") }));
    };
    window.addEventListener("learnix:data-updated", refreshProfile);
    return () => window.removeEventListener("learnix:data-updated", refreshProfile);
  }, [isStudent]);

  useEffect(() => () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
  }, [avatarPreview]);

  const updateProfile = (field, value) => {
    setProfile((current) => ({ ...current, [field]: value }));
  };

  const selectAvatar = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setProfileMessage("Format non pris en charge. Utilisez JPG, JPEG, PNG ou WEBP.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setProfileMessage("L'image ne doit pas dépasser 5 Mo.");
      return;
    }
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setProfileMessage("Prévisualisation prête. Cliquez sur Enregistrer la photo.");
  };

  const saveAvatar = async () => {
    if (!avatarFile) {
      setProfileMessage("Sélectionnez une image avant d'enregistrer.");
      return;
    }
    setAvatarUploading(true);
    const formData = new FormData();
    formData.append("avatar", avatarFile);
    const response = await apiFetch("/api/me/avatar", { method: "POST", body: formData });
    const data = await readApiJson(response, "Impossible d'enregistrer la photo.");
    setAvatarUploading(false);
    if (data.success) {
      setAvatarFile(null);
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
      setAvatarPreview("");
      setProfile((current) => ({ ...current, avatar_url: data.avatar_url }));
      updateStoredUser({ ...user, avatar_url: data.avatar_url });
      setProfileMessage(data.message || "Photo de profil enregistrée.");
      return;
    }
    setProfileMessage(data.message || "Impossible d'enregistrer la photo.");
  };

  const deleteAvatar = async () => {
    setAvatarUploading(true);
    const response = await apiFetch("/api/me/avatar", { method: "DELETE" });
    const data = await readApiJson(response, "Impossible de supprimer la photo.");
    setAvatarUploading(false);
    if (data.success) {
      setAvatarFile(null);
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
      setAvatarPreview("");
      setProfile((current) => ({ ...current, avatar_url: "" }));
      updateStoredUser({ ...user, avatar_url: null });
      setProfileMessage(data.message || "Photo de profil supprimée.");
      return;
    }
    setProfileMessage(data.message || "Impossible de supprimer la photo.");
  };

  const savePassword = async () => {
    if (passwordForm.newPassword !== passwordForm.confirmation) {
      setPasswordMessage("Les nouveaux mots de passe ne correspondent pas.");
      return;
    }
    const response = await apiFetch("/api/change-password", {
      method: "PATCH",
      body: JSON.stringify(passwordForm),
    });
    const data = await readApiJson(response, t.serverError);
    setPasswordMessage(data.success ? t.passwordSaved : data.message || t.serverError);
    if (data.success) setPasswordForm({ currentPassword: "", newPassword: "", confirmation: "" });
    window.setTimeout(() => setPasswordMessage(""), 2400);
  };

  const saveProfile = async () => {
    const response = await apiFetch(isStudent ? "/api/student/profile" : "/api/me", {
      method: "PATCH",
      body: JSON.stringify(isStudent ? {
        ...profile,
        interests: profile.interests.split(",").map((item) => item.trim()).filter(Boolean),
      } : { name: profile.name, phone: profile.phone }),
    });
    const data = await readApiJson(response, t.serverError);
    setProfileMessage(data.success ? "Profil enregistré" : data.message || t.serverError);
    if (data.success) {
      if (isStudent) {
        localStorage.setItem(storageKeyForRole(role), JSON.stringify({ ...user, name: profile.name, ...profile }));
      } else {
        await refreshCurrentProfile();
      }
    }
    window.setTimeout(() => setProfileMessage(""), 2400);
  };

  const requestAssignment = async (type) => {
    const isSchool = type === "school";
    const selectedId = isSchool ? requestedSchoolId : requestedClassId;
    if (!selectedId) return;
    const response = await apiFetch(isSchool ? "/api/student-school-requests" : "/api/student-class-requests", {
      method: "POST",
      body: JSON.stringify(isSchool ? { schoolId: selectedId } : { classId: selectedId }),
    });
    const data = await readApiJson(response, t.serverError);
    setProfileMessage(data.success ? "Demande d'affectation envoyée" : data.message || t.serverError);
  };

  const visibleRole = profile.roleLabel || roleLabel(profile.role || role, t);
  const visibleStatus = profile.statusLabel || STATUS_LABELS[profile.status] || profile.status || "";

  return (
    <LearnixLayout
      title={t.settings}
      subtitle={t.settingsSubtitle}
      profileUser={{ ...user, name: profile.name, avatar_url: profile.avatar_url }}
      panelLabel={panelLabelForRole(role, t)}
      fallbackInitial={isStudent ? "S" : "L"}
      fallbackName={isStudent ? t.studentFallback : t.teacherFallback}
    >
      <nav className="settings-nav" aria-label="Sections des paramètres">
        {[
          ["profile", "Profil"],
          ["appearance", "Apparence"],
          ["security", "Sécurité"],
          ["ai", "Préférences IA"],
        ].map(([value, label]) => <button className={activeSection === value ? "active" : ""} key={value} type="button" onClick={() => setActiveSection(value)}>{label}</button>)}
      </nav>
      <div className={`settings-page settings-section-${activeSection}`}>
        {activeSection === "profile" && <section className="dash-card settings-card settings-profile-card">
          <div className="settings-card-head">
            <span className="badge">{t.profileSettings}</span>
            <p>{t.profileSettingsText}</p>
          </div>

          <div className="settings-profile-row">
            <Avatar user={profile} name={profile.name || profile.email} src={avatarPreview || profile.avatar_url} size={124} clickable={!avatarPreview} />
            <div>
              <h3>{profile.name || (isStudent ? t.studentFallback : t.teacherFallback)}</h3>
              <p>{profile.email || t.noEmailSaved}</p>
              <div className="settings-avatar-tools">
                <label>
                  Modifier la photo
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={selectAvatar} />
                </label>
                <button type="button" onClick={saveAvatar} disabled={!avatarFile || avatarUploading}>{avatarUploading ? "Importation..." : "Enregistrer la photo"}</button>
                <button className="danger" type="button" onClick={deleteAvatar} disabled={avatarUploading || (!profile.avatar_url && !avatarPreview)}>Supprimer la photo</button>
              </div>
            </div>
          </div>

          <div className="settings-form-grid">
            <label>
              <span>{t.name}</span>
              <input
                value={profile.name}
                onChange={(event) => updateProfile("name", event.target.value)}
                placeholder={t.studentName}
              />
            </label>
            <label>
              <span>{t.email}</span>
              <input
                type="email"
                value={profile.email}
                readOnly
                placeholder="student@example.com"
              />
            </label>
            <label>
              <span>{t.phone}</span>
              <input
                value={profile.phone}
                onChange={(event) => updateProfile("phone", event.target.value)}
                placeholder="+973 0000 0000"
              />
            </label>
            {isStudent && <>
              <label><span>Niveau d'étude</span><select value={profile.educationLevel || ""} onChange={(event) => updateProfile("educationLevel", event.target.value)}><option value="">Choisir un niveau</option>{levels.map((level) => <option key={level.name} value={level.name}>{level.name}</option>)}</select></label>
              <label><span>Date de naissance</span><input type="date" value={profile.birthDate || ""} onChange={(event) => updateProfile("birthDate", event.target.value)} /></label>
              <label><span>École</span><input value={profile.schoolName || "Non assignée"} readOnly /></label>
              <label><span>Classe</span><input value={profile.className || "Non assignée"} readOnly /></label>
              <label><span>Responsable / parent</span><input value={profile.guardianName || ""} onChange={(event) => updateProfile("guardianName", event.target.value)} /></label>
              <label><span>Téléphone du responsable</span><input value={profile.guardianPhone || ""} onChange={(event) => updateProfile("guardianPhone", event.target.value)} /></label>
              <label><span>Style d'apprentissage</span><select value={profile.learningStyle || ""} onChange={(event) => updateProfile("learningStyle", event.target.value)}><option value="">Non défini</option><option value="visual">Visuel</option><option value="auditory">Auditif</option><option value="practice">Pratique</option><option value="mixed">Mixte</option></select></label>
              <label><span>Centres d'intérêt</span><input value={profile.interests || ""} onChange={(event) => updateProfile("interests", event.target.value)} placeholder="Mathématiques, programmation..." /></label>
              <label className="settings-field-wide"><span>Objectifs et remarques</span><textarea value={profile.notes || ""} onChange={(event) => updateProfile("notes", event.target.value)} /></label>
            </>}
            {!isStudent && <>
              <label><span>Rôle</span><input value={visibleRole} readOnly /></label>
              <label><span>Établissement affecté</span><input value={profile.schoolName || "Non affecté"} readOnly /></label>
              <label><span>Statut</span><input value={visibleStatus} readOnly /></label>
            </>}
          </div>
          <button className="primary-action settings-action" type="button" onClick={saveProfile}>Enregistrer le profil</button>
          {profileMessage && <div className="toast-notification">{profileMessage}</div>}
        </section>}

        {activeSection === "profile" && isStudent && (
          <section className="dash-card settings-card settings-assignment-card">
            <div className="settings-card-head">
              <span className="badge">Affectation scolaire</span>
              <h3>Rejoindre une école et une classe</h3>
              <p>La direction valide chaque demande avant d'activer les données de l'établissement.</p>
            </div>
            {!profile.schoolId ? (
              <div className="settings-request-row">
                <select value={requestedSchoolId} onChange={(event) => setRequestedSchoolId(event.target.value)}>
                  <option value="">Choisir une école</option>
                  {schools.map((school) => <option key={school.id} value={school.id}>{school.name} - {school.city}</option>)}
                </select>
                <button type="button" onClick={() => requestAssignment("school")}>Demander l'affectation</button>
              </div>
            ) : !profile.classId ? (
              <div className="settings-request-row">
                <select value={requestedClassId} onChange={(event) => setRequestedClassId(event.target.value)}>
                  <option value="">Choisir une classe</option>
                  {classes.map((item) => <option key={item.id} value={item.id}>{item.name} - {item.levelName}</option>)}
                </select>
                <button type="button" onClick={() => requestAssignment("class")}>Demander la classe</button>
              </div>
            ) : <p>Vous êtes affecté à {profile.schoolName}, classe {profile.className}.</p>}
          </section>
        )}

        {activeSection === "appearance" && <section className="dash-card settings-card">
          <div className="settings-card-head">
            <span className="badge">{t.languageSettings}</span>
            <h3>{t.interfaceLanguage}</h3>
            <p>{t.languageSettingsText}</p>
          </div>
          <div className="settings-segmented" role="group" aria-label={t.language}>
            {[
              ["en", t.english],
              ["fr", t.french],
              ["ar", t.arabic],
            ].map(([value, label]) => (
              <button
                className={language === value ? "active" : ""}
                key={value}
                type="button"
                onClick={() => setLanguage(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </section>}

        {activeSection === "appearance" && <section className="dash-card settings-card">
          <div className="settings-card-head">
            <span className="badge">{t.themeSettings}</span>
            <h3>{t.displayMode}</h3>
            <p>{t.themeSettingsText}</p>
          </div>
          <div className="settings-segmented" role="group" aria-label={t.themeSettings}>
            {["light", "dark"].map((value) => (
              <button
                className={theme === value ? "active" : ""}
                key={value}
                type="button"
                onClick={() => setTheme(value)}
              >
                {value === "light" ? t.lightMode : t.darkMode}
              </button>
            ))}
          </div>
        </section>}

        {activeSection === "security" && <section className="dash-card settings-card settings-security-card">
          <div className="settings-card-head">
            <span className="badge">{t.security}</span>
            <h3>{t.changePassword}</h3>
            <p>{t.passwordText}</p>
          </div>
          <div className="settings-form-grid single">
            <label>
              <span>{t.currentPassword}</span>
              <input type="password" value={passwordForm.currentPassword} onChange={(event) => setPasswordForm({ ...passwordForm, currentPassword: event.target.value })} placeholder={t.enterCurrentPassword} />
            </label>
            <label>
              <span>{t.newPassword}</span>
              <input type="password" value={passwordForm.newPassword} onChange={(event) => setPasswordForm({ ...passwordForm, newPassword: event.target.value })} placeholder={t.enterNewPassword} />
            </label>
            <label><span>Confirmer le nouveau mot de passe</span><input type="password" value={passwordForm.confirmation} onChange={(event) => setPasswordForm({ ...passwordForm, confirmation: event.target.value })} placeholder="Répétez le nouveau mot de passe" /></label>
          </div>
          <button className="primary-action settings-action" type="button" onClick={savePassword}>
            {t.savePassword}
          </button>
          {passwordMessage && <div className="toast-notification">{passwordMessage}</div>}
        </section>}

        {activeSection === "ai" && <section className="dash-card settings-card">
          <div className="settings-card-head">
            <span className="badge">{t.aiPreferences}</span>
            <h3>{t.preferredAiLanguage}</h3>
            <p>{t.preferredAiLanguageText}</p>
          </div>
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
          >
            <option value="en">{t.english}</option>
            <option value="fr">{t.french}</option>
            <option value="ar">{t.arabic}</option>
          </select>
        </section>}

      </div>
    </LearnixLayout>
  );
}

export default Settings;

