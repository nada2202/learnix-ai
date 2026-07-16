from __future__ import annotations

import html
import math
from pathlib import Path
from typing import Iterable, Sequence

from PIL import Image, ImageDraw, ImageFont


OUT = Path(__file__).resolve().parent / "uml_assets"
FONT = Path("C:/Windows/Fonts/arial.ttf")
FONT_BOLD = Path("C:/Windows/Fonts/arialbd.ttf")
A4W, A4H = 3508, 2480


class Canvas:
    def __init__(self, name: str, title: str):
        self.name = name
        self.w = A4W
        self.h = A4H
        self.ops: list[tuple] = []
        self.text(A4W / 2, 70, title, 42, True)

    def rect(self, x, y, w, h, width=2, fill="white"):
        self.ops.append(("rect", x, y, w, h, width, fill))

    def ellipse(self, x, y, w, h, width=2, fill="white"):
        self.ops.append(("ellipse", x, y, w, h, width, fill))

    def line(self, x1, y1, x2, y2, width=2, dash=False):
        self.ops.append(("line", x1, y1, x2, y2, width, dash))

    def polyline(self, pts: Sequence[tuple[int, int]], width=2, dash=False):
        self.ops.append(("polyline", list(pts), width, dash))

    def polygon(self, pts: Sequence[tuple[int, int]], width=2, fill="white"):
        self.ops.append(("polygon", list(pts), width, fill))

    def text(self, x, y, text, size=26, bold=False, anchor="mm", max_width=None, gap=6):
        self.ops.append(("text", x, y, text, size, bold, anchor, max_width, gap))

    def arrow(self, x1, y1, x2, y2, width=2, dash=False, open_head=False):
        self.line(x1, y1, x2, y2, width, dash)
        angle = math.atan2(y2 - y1, x2 - x1)
        length, spread = 17, math.pi / 7
        p1 = (x2 - length * math.cos(angle - spread), y2 - length * math.sin(angle - spread))
        p2 = (x2 - length * math.cos(angle + spread), y2 - length * math.sin(angle + spread))
        if open_head:
            self.line(int(p1[0]), int(p1[1]), x2, y2, width)
            self.line(int(p2[0]), int(p2[1]), x2, y2, width)
        else:
            self.polygon([(x2, y2), (int(p1[0]), int(p1[1])), (int(p2[0]), int(p2[1]))], 1, "black")

    def actor(self, x, y, label):
        self.ellipse(x - 20, y - 70, 40, 40, 2)
        self.line(x, y - 30, x, y + 42, 2)
        self.line(x - 42, y, x + 42, y, 2)
        self.line(x, y + 42, x - 38, y + 100, 2)
        self.line(x, y + 42, x + 38, y + 100, 2)
        self.text(x, y + 142, label, 25, max_width=180)

    def save(self):
        OUT.mkdir(parents=True, exist_ok=True)
        self._save_svg()
        self._save_png()

    def font(self, size, bold=False):
        return ImageFont.truetype(str(FONT_BOLD if bold else FONT), size)

    def wrap(self, value: str, size: int, max_width: int | None, bold=False):
        if not max_width:
            return [value]
        font = self.font(size, bold)
        draw = ImageDraw.Draw(Image.new("RGB", (1, 1)))
        lines: list[str] = []
        current = ""
        for word in value.split():
            candidate = f"{current} {word}".strip()
            if draw.textbbox((0, 0), candidate, font=font)[2] <= max_width or not current:
                current = candidate
            else:
                lines.append(current)
                current = word
        if current:
            lines.append(current)
        return lines

    def _save_svg(self):
        parts = [
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.w}" height="{self.h}" viewBox="0 0 {self.w} {self.h}">',
            '<rect width="100%" height="100%" fill="white"/>',
            '<defs><style>text{font-family:Arial,Helvetica,sans-serif;fill:black}.b{font-weight:700}</style></defs>',
        ]
        for op in self.ops:
            k = op[0]
            if k == "rect":
                _, x, y, w, h, lw, fill = op
                parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}" stroke="black" stroke-width="{lw}"/>')
            elif k == "ellipse":
                _, x, y, w, h, lw, fill = op
                parts.append(f'<ellipse cx="{x+w/2}" cy="{y+h/2}" rx="{w/2}" ry="{h/2}" fill="{fill}" stroke="black" stroke-width="{lw}"/>')
            elif k == "line":
                _, x1, y1, x2, y2, lw, dash = op
                d = ' stroke-dasharray="12 9"' if dash else ""
                parts.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="black" stroke-width="{lw}"{d}/>')
            elif k == "polyline":
                _, pts, lw, dash = op
                d = ' stroke-dasharray="12 9"' if dash else ""
                parts.append(f'<polyline points="{" ".join(f"{x},{y}" for x,y in pts)}" fill="none" stroke="black" stroke-width="{lw}"{d}/>')
            elif k == "polygon":
                _, pts, lw, fill = op
                parts.append(f'<polygon points="{" ".join(f"{x},{y}" for x,y in pts)}" fill="{fill}" stroke="black" stroke-width="{lw}"/>')
            elif k == "text":
                _, x, y, value, size, bold, anchor, max_width, gap = op
                lines = self.wrap(value, size, max_width, bold)
                total = len(lines) * size + (len(lines) - 1) * gap
                yy = y - total / 2 + size * .8 if anchor.endswith("m") else y
                align = "middle" if anchor.startswith("m") else "start"
                cls = ' class="b"' if bold else ""
                for line in lines:
                    parts.append(f'<text x="{x}" y="{yy}" font-size="{size}" text-anchor="{align}"{cls}>{html.escape(line)}</text>')
                    yy += size + gap
        parts.append("</svg>")
        (OUT / f"{self.name}.svg").write_text("\n".join(parts), encoding="utf-8")

    def _save_png(self):
        img = Image.new("RGB", (self.w, self.h), "white")
        d = ImageDraw.Draw(img)
        for op in self.ops:
            k = op[0]
            if k == "rect":
                _, x, y, w, h, lw, fill = op
                d.rectangle([x, y, x + w, y + h], fill=fill, outline="black", width=lw)
            elif k == "ellipse":
                _, x, y, w, h, lw, fill = op
                d.ellipse([x, y, x + w, y + h], fill=fill, outline="black", width=lw)
            elif k == "line":
                _, x1, y1, x2, y2, lw, dash = op
                dashed(d, (x1, y1), (x2, y2), lw) if dash else d.line([x1, y1, x2, y2], fill="black", width=lw)
            elif k == "polyline":
                _, pts, lw, dash = op
                for a, b in zip(pts, pts[1:]):
                    dashed(d, a, b, lw) if dash else d.line([a, b], fill="black", width=lw)
            elif k == "polygon":
                _, pts, lw, fill = op
                d.polygon(pts, fill=fill, outline="black")
            elif k == "text":
                _, x, y, value, size, bold, anchor, max_width, gap = op
                font = self.font(size, bold)
                lines = self.wrap(value, size, max_width, bold)
                total = len(lines) * size + (len(lines) - 1) * gap
                yy = y - total / 2 if anchor.endswith("m") else y
                for line in lines:
                    bb = d.textbbox((0, 0), line, font=font)
                    tx = x - (bb[2] - bb[0]) / 2 if anchor.startswith("m") else x
                    d.text((tx, yy), line, fill="black", font=font)
                    yy += size + gap
        img.save(OUT / f"{self.name}.png", dpi=(300, 300))


def dashed(draw, p1, p2, width=2, dash=18, gap=12):
    x1, y1 = p1
    x2, y2 = p2
    dist = math.hypot(x2 - x1, y2 - y1)
    if not dist:
        return
    dx, dy = (x2 - x1) / dist, (y2 - y1) / dist
    pos = 0
    while pos < dist:
        end = min(pos + dash, dist)
        draw.line([x1 + dx * pos, y1 + dy * pos, x1 + dx * end, y1 + dy * end], fill="black", width=width)
        pos += dash + gap


def usecase(c: Canvas, x, y, label):
    c.ellipse(x - 130, y - 52, 260, 104, 2)
    c.text(x, y, label, 23, max_width=210)


def package(c: Canvas, x, y, w, h, title, items):
    c.rect(x, y, w, h, 2)
    c.text(x + w / 2, y + 34, title, 27, True)
    cols = 3 if w > 820 else 2
    for i, item in enumerate(items):
        usecase(c, x + 165 + (i % cols) * 275, y + 120 + (i // cols) * 125, item)


def diagram_use_case():
    c = Canvas("01_cas_utilisation_complet", "Diagramme de cas d'utilisation complet - Learnix AI")
    c.rect(420, 150, 2660, 2180, 3)
    c.text(1750, 200, "Plateforme Learnix AI", 31, True)
    packages = [
        (520, 250, 900, 320, "Administration", ["Valider demande école", "Affecter école", "Gérer écoles", "Gérer utilisateurs", "Statistiques globales"]),
        (520, 650, 1020, 320, "Direction", ["Gérer son école", "Gérer classes", "Gérer modules", "Valider enseignant", "Gérer étudiants", "Emploi du temps"]),
        (520, 1050, 1020, 320, "Enseignement", ["Créer cours", "Importer PDF", "Générer quiz", "Générer examens", "Corriger automatiquement", "Consulter résultats"]),
        (520, 1450, 1020, 320, "Apprentissage élève", ["Rejoindre classe", "Consulter cours", "Répondre quiz", "Passer examens", "Progression", "Recommandations IA"]),
        (1900, 850, 820, 320, "Mode élève invité", ["Assistant IA", "Tester exercices", "Tester quiz", "Démonstration"]),
        (1900, 1450, 820, 320, "Moteur IA", ["Analyser PDF", "Extraire contenu", "Détecter niveau", "Personnaliser contenu"]),
    ]
    for p in packages:
        package(c, *p)
    actors = [(170, 410, "Administrateur"), (170, 810, "Directeur"), (170, 1210, "Enseignant"), (170, 1610, "Élève"), (3300, 1120, "Élève invité"), (3300, 1760, "Système IA")]
    for a in actors:
        c.actor(*a)
    links = [((300, 430), (520, 410)), ((300, 830), (520, 810)), ((300, 1230), (520, 1210)), ((300, 1630), (520, 1610)), ((3180, 1140), (2720, 1010)), ((3180, 1780), (2720, 1610))]
    for a, b in links:
        c.line(*a, *b, 2)
    c.line(1540, 1210, 1900, 1610, 2, True)
    c.text(1720, 1390, "<<include>>", 22)
    c.save()


def class_box(c, x, y, w, title, attrs):
    h = 56 + len(attrs) * 28 + 18
    c.rect(x, y, w, h, 2)
    c.text(x + w / 2, y + 30, title, 24, True)
    c.line(x, y + 56, x + w, y + 56, 2)
    yy = y + 78
    for a in attrs:
        c.text(x + 14, yy, a, 18, anchor="ls")
        yy += 28
    return x, y, w, h


def diagram_classes():
    c = Canvas("02_diagramme_classes_complet", "Diagramme de classes complet - Learnix AI")
    boxes = {}
    specs = [
        ("Role", ["id", "nom", "permissions"], 120, 170), ("Utilisateur", ["id", "nom", "email", "motDePasse", "statut"], 520, 170),
        ("Administrateur", ["gérerPlateforme()"], 120, 500), ("Directeur", ["statutValidation", "soumettreDemande()"], 500, 500), ("Enseignant", ["mode", "statut"], 880, 500), ("Élève", ["niveau", "mode"], 1260, 500), ("ÉlèveInvité", ["mode = invité"], 1640, 500),
        ("École", ["id", "nom", "ville", "statut"], 420, 880), ("DemandeCreationEcole", ["id", "statut", "motif"], 820, 880), ("DemandeEnseignant", ["id", "message", "statut"], 1220, 880),
        ("Classe", ["id", "nom", "niveau"], 260, 1230), ("Module", ["id", "nom", "heures"], 660, 1230), ("Cours", ["id", "titre", "contenu"], 1060, 1230), ("EmploiDuTemps", ["id", "statut", "créneaux"], 1460, 1230),
        ("Quiz", ["id", "titre", "portée"], 260, 1580), ("Examen", ["id", "titre", "durée"], 660, 1580), ("Question", ["id", "énoncé", "points"], 1060, 1580), ("Réponse", ["id", "contenu", "correcte"], 1460, 1580), ("Résultat", ["id", "score", "feedback"], 1860, 1580),
        ("ProfilIA", ["id", "niveauEstimé", "forces", "faiblesses"], 1260, 690), ("RecommandationIA", ["id", "titre", "priorité"], 1660, 690), ("Notification", ["id", "titre", "lue"], 2460, 500),
    ]
    for name, attrs, x, y in specs:
        boxes[name] = class_box(c, x, y, 310, name, attrs)

    def mid(name, side):
        x, y, w, h = boxes[name]
        return {"r": (x + w, y + h / 2), "l": (x, y + h / 2), "t": (x + w / 2, y), "b": (x + w / 2, y + h)}[side]

    def rel(a, b, sa, sb, label="", dash=False, arrow=False):
        x1, y1 = mid(a, sa); x2, y2 = mid(b, sb)
        c.arrow(x1, y1, x2, y2, 2, dash, open_head=arrow) if arrow else c.line(x1, y1, x2, y2, 2, dash)
        if label:
            c.text((x1+x2)/2, (y1+y2)/2 - 15, label, 17, max_width=140)

    def routed(a, b, sa, sb, points, label=""):
        x1, y1 = mid(a, sa); x2, y2 = mid(b, sb)
        route = [(x1, y1), *points, (x2, y2)]
        c.polyline([(int(x), int(y)) for x, y in route], 2)
        if label:
            px, py = points[len(points) // 2] if points else ((x1 + x2) / 2, (y1 + y2) / 2)
            c.text(px, py - 15, label, 17, max_width=140)

    rel("Role", "Utilisateur", "r", "l", "1..*", False)
    for child in ["Administrateur", "Directeur", "Enseignant", "Élève", "ÉlèveInvité"]:
        rel(child, "Utilisateur", "t", "b", "hérite", True, True)
    rel("Directeur", "École", "b", "t", "dirige")
    rel("Directeur", "DemandeCreationEcole", "b", "t", "soumet")
    rel("Enseignant", "DemandeEnseignant", "b", "t", "demande")
    rel("École", "Classe", "b", "t", "1..*")
    rel("Classe", "Module", "r", "l", "1..*")
    rel("Module", "Cours", "r", "l", "1..*")
    rel("Classe", "EmploiDuTemps", "r", "l", "1")
    rel("Cours", "Quiz", "b", "t", "0..*")
    rel("Cours", "Examen", "b", "t", "0..*")
    rel("Quiz", "Question", "r", "l", "1..*")
    rel("Question", "Réponse", "r", "l", "1..*")
    rel("Réponse", "Résultat", "r", "l", "produit")
    rel("Élève", "ProfilIA", "b", "t", "1")
    rel("ProfilIA", "RecommandationIA", "r", "l", "0..*")
    routed("Utilisateur", "Notification", "r", "l", [(2350, 275), (2350, 570)], "0..*")
    c.save()


def participants(c, names):
    xs = [250 + i * ((A4W - 500) // (len(names)-1)) for i in range(len(names))]
    for name, x in zip(names, xs):
        c.rect(x - 145, 180, 290, 70, 2)
        c.text(x, 215, name, 24, True, max_width=250)
        c.line(x, 250, x, 2240, 2, True)
    return xs


def messages(c, xs, rows):
    y = 350
    for a, b, label in rows:
        x1, x2 = xs[a], xs[b]
        if a == b:
            c.polyline([(x1, y), (x1 + 130, y), (x1 + 130, y + 45), (x1, y + 45)], 2)
            c.text(x1 + 160, y + 12, label, 21, anchor="ls", max_width=390)
        else:
            c.arrow(x1, y, x2, y, 2)
            c.text((x1+x2)/2, y - 26, label, 21, max_width=460)
        y += 145


def sequence(name, title, names, rows):
    c = Canvas(name, title)
    xs = participants(c, names)
    messages(c, xs, rows)
    c.save()


def diagram_sequences():
    sequence("03_sequence_creation_ecole", "Séquence - Création d'école et validation administrateur",
        ["Directeur", "Frontend", "API Schools", "MySQL", "Administrateur"],
        [(0,1,"Remplir demande d'école"), (1,2,"POST /api/schools"), (2,3,"Créer schools + school_requests"), (2,4,"Notifier demande en attente"), (4,2,"PATCH décision"), (2,3,"Mettre statut approved/rejected"), (2,0,"Activer tableau de bord si accepté")])
    sequence("04_sequence_validation_enseignant", "Séquence - Validation d'un enseignant par le directeur",
        ["Enseignant", "Frontend", "API Platform", "MySQL", "Directeur"],
        [(0,1,"Demander à rejoindre une école"), (1,2,"POST /api/teacher-school-requests"), (2,3,"Créer teacher_school_requests"), (2,4,"Afficher demande de validation"), (4,2,"Approuver ou refuser"), (2,3,"Mettre statut et rattacher école"), (2,0,"Accès école si approuvé")])
    sequence("05_sequence_parcours_eleve_ia", "Séquence - Parcours complet d'un élève avec IA",
        ["Élève", "Frontend", "API Flask", "Moteur IA", "MySQL"],
        [(0,1,"Importer PDF ou choisir cours"), (1,2,"Envoyer contenu"), (2,3,"Analyser niveau et matière"), (3,2,"Générer exercices / quiz"), (2,0,"Afficher activités"), (0,2,"Soumettre réponses"), (2,3,"Corriger et produire feedback"), (2,4,"Enregistrer résultat"), (2,3,"Mettre à jour ProfilIA"), (3,0,"Recommandations personnalisées")])
    sequence("06_sequence_quiz_pdf", "Séquence - Génération automatique d'un quiz à partir d'un PDF",
        ["Utilisateur", "Frontend", "API /chatbot-upload", "Extracteur PDF", "Groq IA", "MySQL"],
        [(0,1,"Importer PDF"), (1,2,"POST fichier PDF"), (2,3,"Extraire texte"), (3,2,"Texte nettoyé"), (2,4,"Prompt génération quiz"), (4,2,"Questions structurées"), (2,5,"Sauvegarder contexte si nécessaire"), (2,0,"Retourner quiz généré")])
    sequence("07_sequence_correction_examen", "Séquence - Correction automatique d'un examen",
        ["Élève", "Frontend", "API /correct-quiz", "Groq IA", "MySQL"],
        [(0,1,"Soumettre réponses examen"), (1,2,"Envoyer réponses + questions"), (2,3,"Comparer aux réponses attendues"), (3,2,"Score et feedback détaillé"), (2,4,"Créer answers / attempts / results"), (2,0,"Afficher correction automatique")])


def action(c, x, y, w, h, label):
    c.rect(x - w/2, y - h/2, w, h, 2); c.text(x, y, label, 24, max_width=w-40)


def diamond(c, x, y, w, h, label):
    c.polygon([(x, y-h/2), (x+w/2, y), (x, y+h/2), (x-w/2, y)], 2); c.text(x, y, label, 21, max_width=w-55)


def diagram_activity_global():
    c = Canvas("08_activite_global", "Diagramme d'activité global - Learnix AI")
    c.ellipse(1690, 145, 120, 60, 2, "black")
    action(c, 1750, 300, 500, 80, "Créer compte ou se connecter")
    action(c, 1750, 455, 500, 80, "Vérifier JWT et rôle")
    diamond(c, 1750, 650, 480, 150, "Rôle utilisateur ?")
    lanes = [(520,"Admin","Dashboard admin"), (1050,"Directeur","École validée ?"), (1580,"Enseignant","Accepté par directeur ?"), (2110,"Élève","Classe affectée ?"), (2640,"Invité","Mode démonstration")]
    c.arrow(1750,205,1750,260); c.arrow(1750,340,1750,415); c.arrow(1750,495,1750,575)
    for x, role, label in lanes:
        c.arrow(1750, 725, x, 860); c.text((1750+x)/2, 810, role, 20)
        diamond(c, x, 960, 330, 130, label) if "?" in label else action(c, x, 960, 350, 85, label)
    for x in [520,1050,1580,2110,2640]:
        action(c, x, 1210, 360, 85, "Accéder aux services autorisés")
        c.arrow(x, 1025, x, 1165)
        c.arrow(x, 1255, 1750, 1490)
    action(c, 1750, 1540, 560, 85, "Utiliser IA, quiz, cours ou gestion")
    action(c, 1750, 1710, 560, 85, "Enregistrer données et historique")
    action(c, 1750, 1880, 560, 85, "Mettre à jour progression")
    c.ellipse(1690, 2070, 120, 60, 2); c.ellipse(1705, 2085, 90, 30, 2, "black")
    c.arrow(1750,1585,1750,1665); c.arrow(1750,1755,1750,1835); c.arrow(1750,1925,1750,2070)
    c.save()


def diagram_activity_director():
    c = Canvas("09_activite_gestion_ecole_directeur", "Diagramme d'activité - Gestion d'une école par le directeur")
    c.ellipse(1690, 150, 120, 60, 2, "black")
    steps = [
        (1750, 310, "Se connecter comme directeur"),
        (1750, 470, "Vérifier statut de l'école"),
        (900, 690, "Soumettre demande de création d'école"),
        (900, 850, "Attendre décision administrateur"),
        (1750, 690, "Accéder au tableau de bord directeur"),
        (1750, 850, "Gérer école, classes et modules"),
        (1750, 1010, "Traiter demandes enseignants"),
        (1750, 1170, "Gérer élèves et affectations"),
        (1750, 1330, "Créer ou modifier emploi du temps"),
        (1750, 1490, "Consulter statistiques école"),
    ]
    action(c, steps[0][0], steps[0][1], 520, 80, steps[0][2])
    diamond(c, 1750, 470, 460, 135, "École approuvée ?")
    for x,y,t in steps[2:]:
        action(c, x, y, 560, 80, t)
    c.arrow(1750,180,1750,270); c.arrow(1750,350,1750,405)
    c.arrow(1560,500,900,650); c.text(1230,560,"Non",22)
    c.arrow(900,730,900,810)
    c.arrow(1940,500,1750,650); c.text(1980,560,"Oui",22)
    for y1,y2 in [(730,810),(890,970),(1050,1130),(1210,1290),(1370,1450)]:
        c.arrow(1750,y1,1750,y2)
    c.ellipse(1690, 1670, 120, 60, 2); c.ellipse(1705,1685,90,30,2,"black")
    c.arrow(1750,1530,1750,1670); c.arrow(900,890,1690,1670)
    c.save()


def table(c, x, y, name, fields):
    h = 54 + len(fields) * 25 + 14
    c.rect(x, y, 270, h, 2)
    c.text(x+135, y+28, name, 22, True)
    c.line(x, y+54, x+270, y+54, 2)
    yy = y+75
    for f in fields:
        c.text(x+12, yy, f, 16, anchor="ls")
        yy += 25
    return (x, y, 270, h)


def diagram_erd():
    c = Canvas("10_erd_mysql", "Diagramme ERD - Base de données MySQL")
    specs = [
        ("roles", ["PK id", "name"], 80, 160), ("users", ["PK id", "FK role_id", "email", "status"], 420, 160), ("schools", ["PK id", "FK director_user_id", "status"], 760, 160), ("school_requests", ["PK id", "FK school_id", "FK requester_user_id"], 1100, 160),
        ("teachers", ["PK id", "FK user_id", "FK school_id"], 80, 520), ("students", ["PK id", "FK user_id", "FK school_id"], 420, 520), ("classes", ["PK id", "FK school_id", "level_name"], 760, 520), ("modules", ["PK id", "name", "weekly_hours"], 1100, 520),
        ("class_students", ["PK class_id", "PK student_user_id"], 80, 880), ("class_teachers", ["PK class_id", "PK teacher_user_id"], 420, 880), ("class_modules", ["PK class_id", "PK module_id"], 760, 880), ("teacher_school_requests", ["PK id", "FK teacher_user_id", "FK school_id"], 1100, 880),
        ("courses", ["PK id", "FK class_id", "FK module_id"], 1500, 160), ("course_files", ["PK id", "FK course_id"], 1840, 160), ("quizzes", ["PK id", "FK course_id", "FK module_id"], 2180, 160), ("exams", ["PK id", "FK course_id", "FK module_id"], 2520, 160),
        ("questions", ["PK id", "FK quiz_id", "FK exam_id"], 1500, 520), ("answers", ["PK id", "FK question_id", "FK student_user_id"], 1840, 520), ("attempts", ["PK id", "FK quiz_id", "FK exam_id"], 2180, 520), ("quiz_results", ["PK id", "FK user_id", "score"], 2520, 520),
        ("ai_learning_profiles", ["PK id", "FK user_id", "strengths"], 1500, 880), ("ai_recommendations", ["PK id", "FK student_user_id"], 1840, 880), ("schedules", ["PK id", "FK class_id"], 2180, 880), ("schedule_items", ["PK id", "FK schedule_id"], 2520, 880),
        ("teacher_availability", ["PK id", "FK teacher_user_id"], 1500, 1240), ("notifications", ["PK id", "FK user_id"], 1840, 1240), ("audit_logs", ["PK id", "FK actor_user_id"], 2180, 1240), ("reports", ["PK id", "FK reporter_user_id"], 2520, 1240),
    ]
    boxes = {name: table(c, x, y, name, fields) for name, fields, x, y in specs}
    c.text(620, 1390, "Les clés étrangères principales sont listées dans chaque table. Les tables class_students, class_teachers et class_modules matérialisent les relations plusieurs-à-plusieurs.", 24, max_width=1050)
    c.text(2240, 1580, "Schéma aligné avec les migrations 001/002 et les tables créées dynamiquement par les blueprints Flask.", 24, max_width=1050)
    c.save()


def diagram_architecture():
    c = Canvas("11_architecture_systeme", "Diagramme d'architecture - Learnix AI")
    layers = [
        ("Client React / Vite", 250, 250, 3000, 300, ["Pages rôles", "Dashboards", "Services API", "Protection routes"]),
        ("API Flask", 250, 650, 3000, 420, ["app.py routes legacy", "schools_bp", "platform_bp", "schedule_bp", "ai_bp", "security JWT"]),
        ("Services métier", 250, 1180, 3000, 360, ["Gestion écoles", "Gestion utilisateurs", "Planning", "Évaluations", "Profils IA"]),
        ("Données et IA", 250, 1650, 3000, 360, ["MySQL", "Fichiers PDF", "Groq IA", "Historique quiz", "Audit logs"]),
    ]
    for title,x,y,w,h,items in layers:
        c.rect(x,y,w,h,2); c.text(x+w/2,y+40,title,30,True)
        for i,item in enumerate(items):
            c.rect(x+80+i*560,y+105,430,120,2); c.text(x+295+i*560,y+165,item,24,max_width=350)
    for y in [550,1070,1540]:
        c.arrow(1750,y,1750,y+100,3)
    c.text(3200, 920, "REST JSON", 24, True)
    c.text(3200, 1850, "SQL + fichiers + IA externe", 24, True, max_width=230)
    c.save()


def diagram_packages():
    c = Canvas("12_diagramme_packages", "Diagramme de packages - Learnix AI")
    pkgs = [
        ("frontend", 260, 260, ["pages", "components", "services", "context"]),
        ("backend.app", 1180, 260, ["routes auth", "quiz", "chatbot", "PDF"]),
        ("learnix.security", 2100, 260, ["JWT", "roles", "reset token"]),
        ("learnix.schools", 260, 920, ["écoles", "classes", "modules", "demandes"]),
        ("learnix.platform", 1180, 920, ["dashboard", "utilisateurs", "rapports", "audit"]),
        ("learnix.schedule", 2100, 920, ["disponibilités", "génération planning"]),
        ("learnix.ai", 760, 1580, ["profil IA", "recommandations"]),
        ("learnix.database", 1680, 1580, ["connexion MySQL", "helpers schéma"]),
    ]
    for title,x,y,items in pkgs:
        c.rect(x,y,620,360,2); c.rect(x,y,260,46,2); c.text(x+130,y+25,title,24,True,max_width=230)
        yy=y+105
        for item in items:
            c.text(x+60,yy,f"- {item}",24,anchor="ls"); yy+=55
    deps = [((880,440),(1180,440)), ((1800,440),(2100,440)), ((1490,620),(570,920)), ((1490,620),(1490,920)), ((1490,620),(2410,920)), ((1490,1280),(1990,1580)), ((2410,1280),(1990,1580)), ((1070,1580),(1680,1760))]
    for a,b in deps:
        c.arrow(*a,*b,2,True,True)
    c.save()


def write_index():
    rows = [
        ("01", "Cas d'utilisation complet", "01_cas_utilisation_complet"),
        ("02", "Diagramme de classes complet", "02_diagramme_classes_complet"),
        ("03", "Séquence création école", "03_sequence_creation_ecole"),
        ("04", "Séquence validation enseignant", "04_sequence_validation_enseignant"),
        ("05", "Séquence parcours élève avec IA", "05_sequence_parcours_eleve_ia"),
        ("06", "Séquence génération quiz PDF", "06_sequence_quiz_pdf"),
        ("07", "Séquence correction examen", "07_sequence_correction_examen"),
        ("08", "Activité globale", "08_activite_global"),
        ("09", "Activité gestion école directeur", "09_activite_gestion_ecole_directeur"),
        ("10", "ERD MySQL", "10_erd_mysql"),
        ("11", "Architecture système", "11_architecture_systeme"),
        ("12", "Packages", "12_diagramme_packages"),
    ]
    lines = ["# Diagrammes UML PFE - Learnix AI", "", "Exports en français, format A4 paysage, fond blanc, noir et blanc, PNG 300 DPI et SVG.", "", "| N° | Diagramme | PNG | SVG |", "| --- | --- | --- | --- |"]
    for n, label, stem in rows:
        lines.append(f"| {n} | {label} | `{stem}.png` | `{stem}.svg` |")
    (OUT / "README.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for old in list(OUT.glob("*.png")) + list(OUT.glob("*.svg")):
        old.unlink()
    diagram_use_case()
    diagram_classes()
    diagram_sequences()
    diagram_activity_global()
    diagram_activity_director()
    diagram_erd()
    diagram_architecture()
    diagram_packages()
    write_index()


if __name__ == "__main__":
    main()
