# Diagrammes UML et ERD - Learnix AI

Ce document regroupe les diagrammes Mermaid principaux de Learnix AI. Le flux Directeur est base sur la demande de creation d'ecole, puis sur l'acceptation ou le rejet par l'Administrateur.

## 1. Diagramme de cas d'utilisation

```mermaid
flowchart LR
    Admin["Administrateur"]
    Director["Directeur"]
    Teacher["Enseignant"]
    Student["Etudiant"]
    GuestTeacher["Enseignant invite"]
    GuestStudent["Etudiant invite"]
    AISystem["Systeme IA"]
    Database[("Base de donnees")]

    subgraph Platform["Plateforme Learnix AI"]
        UCManageUsers(("Gerer les utilisateurs"))
        UCManageSchools(("Gerer les ecoles"))
        UCCreateSchool(("Creer une ecole"))
        UCAssignSchool(("Affecter une ecole a un directeur"))
        UCApproveSchoolRequest(("Accepter / rejeter une demande d'ecole"))
        UCManageClasses(("Gerer les classes"))
        UCManageModules(("Gerer les modules"))
        UCManageTeachers(("Gerer les enseignants"))
        UCManageStudents(("Gerer les etudiants"))
        UCApproveTeacherRequest(("Accepter / rejeter une demande enseignant"))
        UCCreateCourses(("Creer des cours"))
        UCUploadPDF(("Importer un PDF"))
        UCGenerateExercises(("Generer des exercices"))
        UCCreateQuiz(("Creer un quiz"))
        UCCreateExam(("Creer un examen"))
        UCCorrectAnswers(("Corriger les reponses"))
        UCViewResults(("Consulter les resultats"))
        UCUseAssistant(("Utiliser l'assistant IA"))
        UCViewRecommendations(("Voir les recommandations"))
        UCManageSchedules(("Gerer les emplois du temps"))
        UCViewStats(("Voir les statistiques"))
        UCAuditLogs(("Consulter les journaux d'audit"))
        UCStoreData(("Stocker les donnees"))
        UCTrackProgress(("Suivre la progression"))
    end

    Admin --- UCManageUsers
    Admin --- UCManageSchools
    Admin --- UCCreateSchool
    Admin --- UCAssignSchool
    Admin --- UCApproveSchoolRequest
    Admin --- UCViewStats
    Admin --- UCAuditLogs

    Director --- UCApproveSchoolRequest
    Director --- UCManageClasses
    Director --- UCManageModules
    Director --- UCManageTeachers
    Director --- UCManageStudents
    Director --- UCApproveTeacherRequest
    Director --- UCManageSchedules
    Director --- UCViewStats

    Teacher --- UCCreateCourses
    Teacher --- UCUploadPDF
    Teacher --- UCGenerateExercises
    Teacher --- UCCreateQuiz
    Teacher --- UCCreateExam
    Teacher --- UCCorrectAnswers
    Teacher --- UCViewResults
    Teacher --- UCUseAssistant
    Teacher --- UCTrackProgress

    Student --- UCUploadPDF
    Student --- UCGenerateExercises
    Student --- UCCreateQuiz
    Student --- UCCreateExam
    Student --- UCCorrectAnswers
    Student --- UCViewResults
    Student --- UCUseAssistant
    Student --- UCViewRecommendations

    GuestTeacher --- UCCreateCourses
    GuestTeacher --- UCCreateQuiz
    GuestTeacher --- UCGenerateExercises
    GuestTeacher --- UCUseAssistant

    GuestStudent --- UCUploadPDF
    GuestStudent --- UCGenerateExercises
    GuestStudent --- UCCreateQuiz
    GuestStudent --- UCUseAssistant
    GuestStudent --- UCViewRecommendations

    AISystem --- UCGenerateExercises
    AISystem --- UCCorrectAnswers
    AISystem --- UCUseAssistant
    AISystem --- UCViewRecommendations
    AISystem --- UCTrackProgress

    Database --- UCStoreData
    Database --- UCManageUsers
    Database --- UCManageSchools
    Database --- UCViewResults
    Database --- UCAuditLogs
    Database --- UCTrackProgress
```

Ce diagramme montre les interactions principales entre les roles Learnix AI, le systeme IA et la base de donnees. Les invites utilisent les fonctionnalites libres, tandis que les roles scolaires accedent aux fonctionnalites officielles apres validation.

## 2. Diagramme de classes

```mermaid
classDiagram
    class Role {
        +int id
        +string nom
        +string description
    }

    class User {
        +int id
        +int roleId
        +string nom
        +string email
        +string motDePasseHash
        +string statut
        +datetime creeLe
        +login()
        +logout()
    }

    class Admin {
        +gererUtilisateurs()
        +gererEcoles()
        +validerActions()
        +voirStatistiques()
    }

    class Director {
        +string statutValidation
        +soumettreDemandeEcole()
        +gererEcole()
        +gererClasses()
        +publierEmploiDuTemps()
    }

    class Teacher {
        +string statutAdhesion
        +demanderRejoindreEcole()
        +creerCours()
        +creerQuiz()
        +corrigerReponses()
    }

    class Student {
        +string niveau
        +consulterCours()
        +passerQuiz()
        +voirResultats()
    }

    class GuestTeacher {
        +creerCoursIndependant()
        +creerExercices()
        +utiliserAssistantIA()
    }

    class GuestStudent {
        +string niveauChoisi
        +importerPDF()
        +genererExercices()
        +utiliserAssistantIA()
    }

    class School {
        +int id
        +int directorId
        +string nom
        +string adresse
        +string ville
        +string statut
        +datetime creeLe
    }

    class SchoolRequest {
        +int id
        +int directorId
        +string nomEcole
        +string adresse
        +string statut
        +string commentaireAdmin
        +datetime creeLe
    }

    class ClassRoom {
        +int id
        +int schoolId
        +string nom
        +string niveau
        +string anneeScolaire
    }

    class Module {
        +int id
        +string nom
        +string niveau
        +string description
    }

    class Course {
        +int id
        +int moduleId
        +int teacherId
        +string titre
        +string contenu
    }

    class CourseFile {
        +int id
        +int courseId
        +string nomFichier
        +string chemin
        +string typeMime
    }

    class Quiz {
        +int id
        +int courseId
        +int moduleId
        +string titre
        +int dureeMinutes
    }

    class Exam {
        +int id
        +int courseId
        +int moduleId
        +string titre
        +datetime dateExamen
        +int dureeMinutes
    }

    class Question {
        +int id
        +int quizId
        +int examId
        +string enonce
        +string type
        +float points
    }

    class Answer {
        +int id
        +int questionId
        +string contenu
        +bool correcte
    }

    class Attempt {
        +int id
        +int studentId
        +int quizId
        +int examId
        +datetime commenceLe
        +datetime termineLe
    }

    class Result {
        +int id
        +int attemptId
        +float score
        +string feedback
        +datetime creeLe
    }

    class Schedule {
        +int id
        +int classRoomId
        +string semaine
        +string statut
    }

    class ScheduleItem {
        +int id
        +int scheduleId
        +int teacherId
        +int moduleId
        +string jour
        +time heureDebut
        +time heureFin
        +string salle
    }

    class TeacherAvailability {
        +int id
        +int teacherId
        +string jour
        +time heureDebut
        +time heureFin
    }

    class AIProfile {
        +int id
        +int studentId
        +string niveauActuel
        +json forces
        +json faiblesses
        +json historique
    }

    class AIRecommendation {
        +int id
        +int aiProfileId
        +string type
        +string contenu
        +int priorite
    }

    class Notification {
        +int id
        +int userId
        +string titre
        +string message
        +bool lue
    }

    class Message {
        +int id
        +int senderId
        +int receiverId
        +string contenu
        +datetime envoyeLe
    }

    class AuditLog {
        +int id
        +int userId
        +string action
        +string cible
        +datetime creeLe
    }

    User <|-- Admin
    User <|-- Director
    User <|-- Teacher
    User <|-- Student
    User <|-- GuestTeacher
    User <|-- GuestStudent
    Role "1" --> "0..*" User : definit
    Admin "1" --> "0..*" User : gere
    Admin "1" --> "0..*" School : gere
    Director "1" --> "0..*" School : dirige apres validation
    Director "1" --> "0..*" SchoolRequest : soumet
    School "1" --> "0..*" ClassRoom : contient
    School "1" --> "0..*" Teacher : regroupe
    School "1" --> "0..*" Student : regroupe
    ClassRoom "1" --> "0..*" Student : contient
    ClassRoom "1" --> "0..*" Teacher : affecte
    ClassRoom "1" --> "0..*" Module : propose
    Teacher "0..*" --> "0..*" Module : enseigne
    Student "0..*" --> "0..*" Module : suit
    Module "1" --> "0..*" Course : contient
    Course "1" --> "0..*" CourseFile : possede
    Course "1" --> "0..*" Quiz : supporte
    Module "1" --> "0..*" Quiz : supporte
    Course "1" --> "0..*" Exam : supporte
    Module "1" --> "0..*" Exam : supporte
    Quiz "1" --> "0..*" Question : contient
    Exam "1" --> "0..*" Question : contient
    Question "1" --> "0..*" Answer : propose
    Student "1" --> "0..*" Attempt : effectue
    Attempt "1" --> "1" Result : produit
    Student "1" --> "1" AIProfile : possede
    AIProfile "1" --> "0..*" AIRecommendation : genere
    ClassRoom "1" --> "0..*" Schedule : planifie
    Schedule "1" --> "1..*" ScheduleItem : contient
    Teacher "1" --> "0..*" TeacherAvailability : declare
    User "1" --> "0..*" Notification : recoit
    User "1" --> "0..*" Message : expediteur
    User "1" --> "0..*" Message : destinataire
    User "1" --> "0..*" AuditLog : declenche
```

Ce diagramme de classes represente les entites metier principales, leurs attributs et leurs relations. Les roles heritent de `User`, les classes et modules appartiennent a l'organisation scolaire, et le profil IA reste lie a l'apprentissage de chaque etudiant.

## 3. Diagrammes de sequence

### A. Demande de creation d'ecole par le Directeur

```mermaid
sequenceDiagram
    actor Director as Directeur
    participant System as Systeme Learnix
    participant Database as Base de donnees
    actor Admin as Administrateur

    Director->>System: Soumettre une demande de creation d'ecole
    System->>Database: Enregistrer la demande avec statut "en attente"
    Database-->>System: Demande enregistree
    System-->>Admin: Notifier une nouvelle demande
    Admin->>System: Examiner la demande
    alt Demande approuvee
        Admin->>System: Approuver la demande
        System->>Database: Creer l'ecole et lier le Directeur
        System->>Database: Activer l'acces au tableau de bord Directeur
        System-->>Director: Acces Directeur active
    else Demande rejetee
        Admin->>System: Rejeter la demande avec motif
        System->>Database: Mettre la demande en statut "rejetee"
        System-->>Director: Acces aux fonctions ecole refuse
    end
```

Ce flux confirme que le Directeur demande uniquement la creation d'une ecole. L'acces au tableau de bord Directeur depend de la decision de l'Administrateur.

### B. Demande d'adhesion d'un Enseignant a une ecole

```mermaid
sequenceDiagram
    actor Teacher as Enseignant
    participant System as Systeme Learnix
    participant Database as Base de donnees
    actor Director as Directeur

    Teacher->>System: Demander a rejoindre une ecole
    System->>Database: Enregistrer la demande enseignant
    System-->>Director: Notifier la demande d'adhesion
    Director->>System: Examiner la demande
    alt Demande approuvee
        Director->>System: Approuver l'enseignant
        System->>Database: Lier l'enseignant a l'ecole
        System->>Database: Activer l'acces au tableau de bord ecole
        System-->>Teacher: Acces enseignant active
    else Demande rejetee
        Director->>System: Rejeter la demande
        System->>Database: Mettre la demande en statut "rejetee"
        System-->>Teacher: Acces ecole refuse
    end
```

L'enseignant doit etre accepte par le Directeur avant d'acceder aux classes, modules et contenus officiels de l'ecole.

### C. Parcours d'apprentissage de l'Etudiant

```mermaid
sequenceDiagram
    actor Student as Etudiant
    participant System as Systeme Learnix
    participant AI as Systeme IA
    participant Database as Base de donnees

    Student->>System: Importer un PDF
    System->>System: Extraire le contenu du fichier
    System->>AI: Envoyer le contenu et le niveau de l'etudiant
    AI-->>System: Generer quiz et exercices personnalises
    System-->>Student: Afficher les questions
    Student->>System: Soumettre les reponses
    System->>AI: Corriger les reponses
    AI-->>System: Score, feedback et analyse des faiblesses
    System->>Database: Enregistrer tentative et resultat
    System->>AI: Mettre a jour le profil d'apprentissage
    AI-->>System: Recommandations adaptees
    System->>Database: Stocker profil et recommandations
    System-->>Student: Afficher feedback et recommandations
```

Ce diagramme montre le cycle adaptatif : contenu, generation, correction, stockage, mise a jour du profil IA et recommandations personnalisees.

### D. Gestion des utilisateurs et ecoles par l'Administrateur

```mermaid
sequenceDiagram
    actor Admin as Administrateur
    participant System as Systeme Learnix
    participant Database as Base de donnees
    participant Audit as Journal d'audit

    Admin->>System: Selectionner un utilisateur ou une ecole
    Admin->>System: Mettre a jour / bloquer / supprimer / bannir
    System->>Database: Appliquer la modification
    Database-->>System: Modification confirmee
    System->>Audit: Enregistrer l'action importante
    Audit->>Database: Stocker le journal d'audit
    System-->>Admin: Afficher la confirmation
```

L'Administrateur controle les entites sensibles de la plateforme. Chaque action importante est enregistree dans les journaux d'audit.

### E. Generation d'emploi du temps

```mermaid
sequenceDiagram
    actor Director as Directeur
    participant System as Systeme Learnix
    participant Database as Base de donnees
    participant Scheduler as Moteur de planning
    actor Teacher as Enseignant
    actor Student as Etudiant

    Director->>System: Selectionner classe, modules et enseignants
    System->>Database: Charger disponibilites enseignants
    Database-->>System: Disponibilites et contraintes
    System->>Scheduler: Generer un emploi du temps
    Scheduler-->>System: Proposition de planning
    System-->>Director: Afficher le planning propose
    opt Ajustement manuel
        Director->>System: Modifier les creneaux
        System->>Scheduler: Verifier les conflits
        Scheduler-->>System: Planning valide
    end
    Director->>System: Publier l'emploi du temps
    System->>Database: Enregistrer le planning publie
    System-->>Teacher: Notifier le planning
    System-->>Student: Rendre le planning visible
```

Le Directeur genere un planning a partir des modules, classes et disponibilites des enseignants, puis publie la version finale pour les enseignants et etudiants.

## 4. Diagramme d'activite global

```mermaid
flowchart TD
    Start([Debut])
    Auth["L'utilisateur s'inscrit ou se connecte"]
    Identify["Le systeme identifie le role"]

    AdminRole{"Role Administrateur ?"}
    DirectorRole{"Role Directeur ?"}
    TeacherRole{"Role Enseignant ?"}
    StudentRole{"Role Etudiant ?"}
    GuestTeacherRole{"Role Enseignant invite ?"}
    GuestStudentRole{"Role Etudiant invite ?"}

    AdminDashboard["Acceder au tableau de bord Administrateur"]

    DirectorApproved{"Ecole approuvee ?"}
    DirectorDashboard["Acceder au tableau de bord Directeur"]
    SubmitSchoolRequest["Soumettre une demande de creation d'ecole"]
    WaitAdmin["Attendre la validation Administrateur"]

    TeacherAccepted{"Accepte par le Directeur ?"}
    TeacherDashboard["Acceder au tableau de bord Enseignant"]
    RequestSchool["Demander a rejoindre une ecole"]
    UseGuestTeacher["Utiliser le mode Enseignant invite"]

    StudentAssigned{"Affecte a une ecole ou classe ?"}
    StudentDashboard["Acceder au tableau de bord Etudiant"]
    UseGuestStudent["Utiliser le mode Etudiant invite"]

    GuestTeacherDashboard["Acceder au tableau de bord Enseignant invite"]
    GuestStudentDashboard["Acceder au tableau de bord Etudiant invite"]

    AIFeatures["Utiliser les fonctionnalites IA"]
    StoreResults["Stocker les resultats et historiques"]
    UpdateProgress["Mettre a jour la progression"]
    End([Fin])

    Start --> Auth --> Identify
    Identify --> AdminRole
    AdminRole -- Oui --> AdminDashboard
    AdminRole -- Non --> DirectorRole

    DirectorRole -- Oui --> DirectorApproved
    DirectorApproved -- Oui --> DirectorDashboard
    DirectorApproved -- Non --> SubmitSchoolRequest --> WaitAdmin
    DirectorRole -- Non --> TeacherRole

    TeacherRole -- Oui --> TeacherAccepted
    TeacherAccepted -- Oui --> TeacherDashboard
    TeacherAccepted -- Non --> RequestSchool
    RequestSchool --> UseGuestTeacher
    TeacherRole -- Non --> StudentRole

    StudentRole -- Oui --> StudentAssigned
    StudentAssigned -- Oui --> StudentDashboard
    StudentAssigned -- Non --> UseGuestStudent
    StudentRole -- Non --> GuestTeacherRole

    GuestTeacherRole -- Oui --> GuestTeacherDashboard
    GuestTeacherRole -- Non --> GuestStudentRole
    GuestStudentRole -- Oui --> GuestStudentDashboard
    GuestStudentRole -- Non --> End

    AdminDashboard --> AIFeatures
    DirectorDashboard --> AIFeatures
    TeacherDashboard --> AIFeatures
    StudentDashboard --> AIFeatures
    UseGuestTeacher --> AIFeatures
    UseGuestStudent --> AIFeatures
    GuestTeacherDashboard --> AIFeatures
    GuestStudentDashboard --> AIFeatures
    WaitAdmin --> End
    AIFeatures --> StoreResults --> UpdateProgress --> End
```

Ce diagramme resume le parcours global selon le role. Les acces scolaires officiels dependent des validations, tandis que les modes invites restent disponibles pour l'utilisation libre.

## 5. Diagramme ERD MySQL

```mermaid
erDiagram
    roles {
        INT id PK
        VARCHAR name
        VARCHAR description
        DATETIME created_at
    }

    users {
        INT id PK
        INT role_id FK
        INT school_id FK
        VARCHAR full_name
        VARCHAR email
        VARCHAR password_hash
        VARCHAR status
        VARCHAR education_level
        DATETIME created_at
        DATETIME updated_at
    }

    schools {
        INT id PK
        INT director_id FK
        VARCHAR name
        VARCHAR address
        VARCHAR city
        VARCHAR status
        DATETIME created_at
        DATETIME updated_at
    }

    school_requests {
        INT id PK
        INT director_id FK
        INT reviewed_by FK
        VARCHAR school_name
        VARCHAR address
        VARCHAR city
        VARCHAR status
        TEXT admin_comment
        DATETIME created_at
        DATETIME reviewed_at
    }

    classes {
        INT id PK
        INT school_id FK
        VARCHAR name
        VARCHAR education_level
        VARCHAR academic_year
        DATETIME created_at
    }

    modules {
        INT id PK
        INT school_id FK
        VARCHAR name
        VARCHAR education_level
        TEXT description
        DATETIME created_at
    }

    class_students {
        INT class_id PK, FK
        INT student_id PK, FK
        DATETIME assigned_at
    }

    class_teachers {
        INT class_id PK, FK
        INT teacher_id PK, FK
        DATETIME assigned_at
    }

    module_teachers {
        INT module_id PK, FK
        INT teacher_id PK, FK
        DATETIME assigned_at
    }

    courses {
        INT id PK
        INT module_id FK
        INT teacher_id FK
        VARCHAR title
        TEXT content
        DATETIME created_at
    }

    course_files {
        INT id PK
        INT course_id FK
        VARCHAR file_name
        VARCHAR file_path
        VARCHAR mime_type
        DATETIME uploaded_at
    }

    quizzes {
        INT id PK
        INT course_id FK
        INT module_id FK
        INT created_by FK
        VARCHAR title
        INT duration_minutes
        DATETIME created_at
    }

    exams {
        INT id PK
        INT course_id FK
        INT module_id FK
        INT created_by FK
        VARCHAR title
        DATETIME exam_date
        INT duration_minutes
        DATETIME created_at
    }

    questions {
        INT id PK
        INT quiz_id FK
        INT exam_id FK
        TEXT statement
        VARCHAR question_type
        DECIMAL points
    }

    answers {
        INT id PK
        INT question_id FK
        TEXT content
        BOOLEAN is_correct
    }

    attempts {
        INT id PK
        INT student_id FK
        INT quiz_id FK
        INT exam_id FK
        DATETIME started_at
        DATETIME completed_at
    }

    results {
        INT id PK
        INT attempt_id FK
        DECIMAL score
        TEXT feedback
        DATETIME created_at
    }

    ai_profiles {
        INT id PK
        INT student_id FK
        VARCHAR current_level
        JSON strengths
        JSON weaknesses
        JSON attempt_history
        DATETIME updated_at
    }

    ai_recommendations {
        INT id PK
        INT ai_profile_id FK
        VARCHAR recommendation_type
        TEXT content
        INT priority
        DATETIME created_at
    }

    schedules {
        INT id PK
        INT class_id FK
        VARCHAR week_label
        VARCHAR status
        DATETIME published_at
    }

    schedule_items {
        INT id PK
        INT schedule_id FK
        INT teacher_id FK
        INT module_id FK
        VARCHAR day_name
        TIME start_time
        TIME end_time
        VARCHAR room
    }

    teacher_availability {
        INT id PK
        INT teacher_id FK
        VARCHAR day_name
        TIME start_time
        TIME end_time
    }

    notifications {
        INT id PK
        INT user_id FK
        VARCHAR title
        TEXT message
        BOOLEAN is_read
        DATETIME created_at
    }

    messages {
        INT id PK
        INT sender_id FK
        INT receiver_id FK
        TEXT content
        DATETIME sent_at
        DATETIME read_at
    }

    audit_logs {
        INT id PK
        INT user_id FK
        VARCHAR action
        VARCHAR target_type
        INT target_id
        TEXT details
        DATETIME created_at
    }

    roles ||--o{ users : "definit"
    users ||--o{ schools : "dirige"
    users ||--o{ school_requests : "soumet"
    users ||--o{ school_requests : "examine"
    schools ||--o{ users : "rattache"
    schools ||--o{ classes : "contient"
    schools ||--o{ modules : "propose"
    classes ||--o{ class_students : "associe"
    users ||--o{ class_students : "etudiant"
    classes ||--o{ class_teachers : "associe"
    users ||--o{ class_teachers : "enseignant"
    modules ||--o{ module_teachers : "associe"
    users ||--o{ module_teachers : "enseignant"
    modules ||--o{ courses : "contient"
    users ||--o{ courses : "cree"
    courses ||--o{ course_files : "possede"
    courses ||--o{ quizzes : "supporte"
    modules ||--o{ quizzes : "supporte"
    users ||--o{ quizzes : "cree"
    courses ||--o{ exams : "supporte"
    modules ||--o{ exams : "supporte"
    users ||--o{ exams : "cree"
    quizzes ||--o{ questions : "contient"
    exams ||--o{ questions : "contient"
    questions ||--o{ answers : "propose"
    users ||--o{ attempts : "effectue"
    quizzes ||--o{ attempts : "evalue"
    exams ||--o{ attempts : "evalue"
    attempts ||--|| results : "produit"
    users ||--|| ai_profiles : "possede"
    ai_profiles ||--o{ ai_recommendations : "genere"
    classes ||--o{ schedules : "planifie"
    schedules ||--o{ schedule_items : "contient"
    users ||--o{ schedule_items : "enseigne"
    modules ||--o{ schedule_items : "programme"
    users ||--o{ teacher_availability : "declare"
    users ||--o{ notifications : "recoit"
    users ||--o{ messages : "envoie"
    users ||--o{ messages : "recoit"
    users ||--o{ audit_logs : "declenche"
```

Cet ERD MySQL montre les cles primaires, les cles etrangeres et les tables de liaison plusieurs-a-plusieurs. Les utilisateurs sont relies aux roles, aux ecoles, aux classes, aux modules, aux evaluations, aux messages et aux traces d'audit.

## Niveaux educatifs pris en charge

- 1ere annee college
- 2eme annee college
- 3eme annee college
- Tronc commun
- 1ere annee bac
- 2eme annee bac
- Niveaux universitaires
