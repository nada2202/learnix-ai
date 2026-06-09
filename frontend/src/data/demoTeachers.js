export const demoTeachers = [
  { id: "teacher-math", name: "Mr. Yassine El Amrani", email: "math.teacher@learnix.ai", password: "123456", subject: "Mathematics", section: "Grade 9 / Section A" },
  { id: "teacher-physics", name: "Mr. Omar Haddad", email: "physics.teacher@learnix.ai", password: "123456", subject: "Physics", section: "Grade 10 / Section A" },
  { id: "teacher-english", name: "Ms. Emily Carter", email: "english.teacher@learnix.ai", password: "123456", subject: "English", section: "Grade 8 / Section A" },
  { id: "teacher-french", name: "Mme. Claire Dubois", email: "french.teacher@learnix.ai", password: "123456", subject: "French", section: "Grade 8 / Section B" },
  { id: "teacher-history", name: "Mr. Adam Mansouri", email: "history.teacher@learnix.ai", password: "123456", subject: "History", section: "Grade 9 / Section C" },
  { id: "teacher-programming", name: "Ms. Sara Benali", email: "programming.teacher@learnix.ai", password: "123456", subject: "Programming", section: "Grade 9 / Section B" },
];

const programmingSubjects = ["Programming", "Database", "Network", "Operating Systems", "Web Development"];

export function teacherForSubject(subject) {
  const normalizedSubject = String(subject || "").trim().toLowerCase();

  if (programmingSubjects.some((item) => item.toLowerCase() === normalizedSubject)) {
    return demoTeachers.find((teacher) => teacher.subject === "Programming");
  }

  if (normalizedSubject === "languages") {
    return demoTeachers.find((teacher) => teacher.subject === "English");
  }

  return demoTeachers.find((teacher) => teacher.subject.toLowerCase() === normalizedSubject) || null;
}

export function teacherForUser(user) {
  const text = `${user?.name || ""} ${user?.email || ""} ${user?.subject || ""}`.toLowerCase();
  return demoTeachers.find((teacher) => {
    const subject = teacher.subject.toLowerCase();
    const name = teacher.name.toLowerCase();
    const email = teacher.email.toLowerCase();
    return text.includes(subject) || text.includes(name) || text.includes(email);
  }) || demoTeachers[0];
}

export function demoTeacherForLogin(email, password) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  return demoTeachers.find(
    (teacher) => teacher.email.toLowerCase() === normalizedEmail && teacher.password === password
  ) || null;
}
