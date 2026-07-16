from __future__ import annotations

import html
import math
import textwrap
from pathlib import Path
from typing import Iterable, Sequence

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent
OUT = ROOT / "uml_assets"
FONT = Path("C:/Windows/Fonts/arial.ttf")
FONT_BOLD = Path("C:/Windows/Fonts/arialbd.ttf")


class Canvas:
    def __init__(self, name: str, width: int, height: int):
        self.name = name
        self.w = width
        self.h = height
        self.ops: list[tuple] = []

    def rect(self, x, y, w, h, width=2, fill="white"):
        self.ops.append(("rect", x, y, w, h, width, fill))

    def ellipse(self, x, y, w, h, width=2, fill="white"):
        self.ops.append(("ellipse", x, y, w, h, width, fill))

    def line(self, x1, y1, x2, y2, width=2, dash=False):
        self.ops.append(("line", x1, y1, x2, y2, width, dash))

    def polyline(self, points: Sequence[tuple[int, int]], width=2, dash=False):
        self.ops.append(("polyline", list(points), width, dash))

    def polygon(self, points: Sequence[tuple[int, int]], width=2, fill="white"):
        self.ops.append(("polygon", list(points), width, fill))

    def text(self, x, y, text, size=26, bold=False, anchor="mm", max_width=None, line_gap=6):
        self.ops.append(("text", x, y, text, size, bold, anchor, max_width, line_gap))

    def arrow(self, x1, y1, x2, y2, width=2, dash=False, open_head=False):
        self.line(x1, y1, x2, y2, width, dash)
        angle = math.atan2(y2 - y1, x2 - x1)
        length = 16
        spread = math.pi / 7
        p1 = (x2 - length * math.cos(angle - spread), y2 - length * math.sin(angle - spread))
        p2 = (x2 - length * math.cos(angle + spread), y2 - length * math.sin(angle + spread))
        if open_head:
            self.line(int(p1[0]), int(p1[1]), x2, y2, width)
            self.line(int(p2[0]), int(p2[1]), x2, y2, width)
        else:
            self.polygon([(x2, y2), (int(p1[0]), int(p1[1])), (int(p2[0]), int(p2[1]))], width=1, fill="black")

    def actor(self, x, y, label):
        self.ellipse(x - 18, y - 60, 36, 36, 2)
        self.line(x, y - 24, x, y + 38, 2)
        self.line(x - 38, y, x + 38, y, 2)
        self.line(x, y + 38, x - 34, y + 88, 2)
        self.line(x, y + 38, x + 34, y + 88, 2)
        self.text(x, y + 126, label, 24, max_width=150)

    def save(self):
        OUT.mkdir(parents=True, exist_ok=True)
        self._save_svg()
        self._save_png()

    def _font(self, size, bold=False, scale=1):
        path = FONT_BOLD if bold else FONT
        return ImageFont.truetype(str(path), int(size * scale))

    def _wrap(self, text: str, size: int, max_width: int | None, bold=False):
        if not max_width:
            return [text]
        font = self._font(size, bold)
        words = text.split()
        lines: list[str] = []
        current = ""
        probe = ImageDraw.Draw(Image.new("RGB", (1, 1)))
        for word in words:
            candidate = f"{current} {word}".strip()
            width = probe.textbbox((0, 0), candidate, font=font)[2]
            if width <= max_width or not current:
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
            '<rect x="0" y="0" width="100%" height="100%" fill="white"/>',
            '<defs><style>text{font-family:Arial, Helvetica, sans-serif;fill:#000;} .bold{font-weight:700;}</style></defs>',
        ]
        for op in self.ops:
            kind = op[0]
            if kind == "rect":
                _, x, y, w, h, width, fill = op
                parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}" stroke="black" stroke-width="{width}"/>')
            elif kind == "ellipse":
                _, x, y, w, h, width, fill = op
                parts.append(f'<ellipse cx="{x + w / 2}" cy="{y + h / 2}" rx="{w / 2}" ry="{h / 2}" fill="{fill}" stroke="black" stroke-width="{width}"/>')
            elif kind == "line":
                _, x1, y1, x2, y2, width, dash = op
                dash_attr = ' stroke-dasharray="9 7"' if dash else ""
                parts.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="black" stroke-width="{width}"{dash_attr}/>')
            elif kind == "polyline":
                _, points, width, dash = op
                dash_attr = ' stroke-dasharray="9 7"' if dash else ""
                pts = " ".join(f"{x},{y}" for x, y in points)
                parts.append(f'<polyline points="{pts}" fill="none" stroke="black" stroke-width="{width}"{dash_attr}/>')
            elif kind == "polygon":
                _, points, width, fill = op
                pts = " ".join(f"{x},{y}" for x, y in points)
                parts.append(f'<polygon points="{pts}" fill="{fill}" stroke="black" stroke-width="{width}"/>')
            elif kind == "text":
                _, x, y, text, size, bold, anchor, max_width, line_gap = op
                lines = self._wrap(text, size, max_width, bold)
                total = len(lines) * size + (len(lines) - 1) * line_gap
                if anchor.endswith("m"):
                    start_y = y - total / 2 + size * 0.75
                elif anchor.endswith("s"):
                    start_y = y
                else:
                    start_y = y - total + size
                align = "middle" if anchor.startswith("m") else "start"
                cls = ' class="bold"' if bold else ""
                for i, line in enumerate(lines):
                    yy = start_y + i * (size + line_gap)
                    parts.append(f'<text x="{x}" y="{yy}" font-size="{size}" text-anchor="{align}"{cls}>{html.escape(line)}</text>')
        parts.append("</svg>")
        (OUT / f"{self.name}.svg").write_text("\n".join(parts), encoding="utf-8")

    def _save_png(self):
        scale = 2
        img = Image.new("RGB", (self.w * scale, self.h * scale), "white")
        d = ImageDraw.Draw(img)
        for op in self.ops:
            kind = op[0]
            if kind == "rect":
                _, x, y, w, h, width, fill = op
                d.rectangle([x * scale, y * scale, (x + w) * scale, (y + h) * scale], fill=fill, outline="black", width=width * scale)
            elif kind == "ellipse":
                _, x, y, w, h, width, fill = op
                d.ellipse([x * scale, y * scale, (x + w) * scale, (y + h) * scale], fill=fill, outline="black", width=width * scale)
            elif kind == "line":
                _, x1, y1, x2, y2, width, dash = op
                if dash:
                    draw_dashed_line(d, (x1 * scale, y1 * scale), (x2 * scale, y2 * scale), width * scale, 18 * scale, 12 * scale)
                else:
                    d.line([x1 * scale, y1 * scale, x2 * scale, y2 * scale], fill="black", width=width * scale)
            elif kind == "polyline":
                _, points, width, dash = op
                pts = [(x * scale, y * scale) for x, y in points]
                for a, b in zip(pts, pts[1:]):
                    if dash:
                        draw_dashed_line(d, a, b, width * scale, 18 * scale, 12 * scale)
                    else:
                        d.line([a, b], fill="black", width=width * scale)
            elif kind == "polygon":
                _, points, width, fill = op
                pts = [(x * scale, y * scale) for x, y in points]
                d.polygon(pts, fill=fill, outline="black")
            elif kind == "text":
                _, x, y, text, size, bold, anchor, max_width, line_gap = op
                font = self._font(size, bold, scale)
                lines = self._wrap(text, size, max_width, bold)
                line_h = size * scale + line_gap * scale
                total = len(lines) * size * scale + (len(lines) - 1) * line_gap * scale
                yy = y * scale - total / 2 if anchor.endswith("m") else y * scale
                for line in lines:
                    bbox = d.textbbox((0, 0), line, font=font)
                    tw = bbox[2] - bbox[0]
                    tx = x * scale - tw / 2 if anchor.startswith("m") else x * scale
                    d.text((tx, yy), line, fill="black", font=font)
                    yy += line_h
        img.save(OUT / f"{self.name}.png", dpi=(300, 300))


def draw_dashed_line(draw, p1, p2, width, dash_len, gap_len):
    x1, y1 = p1
    x2, y2 = p2
    dist = math.hypot(x2 - x1, y2 - y1)
    if dist == 0:
        return
    dx, dy = (x2 - x1) / dist, (y2 - y1) / dist
    pos = 0
    while pos < dist:
        end = min(pos + dash_len, dist)
        draw.line([x1 + dx * pos, y1 + dy * pos, x1 + dx * end, y1 + dy * end], fill="black", width=width)
        pos += dash_len + gap_len


def class_box(c: Canvas, x, y, w, name, attrs: Iterable[str], methods: Iterable[str] = ()):
    attrs = list(attrs)
    methods = list(methods)
    attr_h = max(46, 28 * len(attrs) + 18)
    meth_h = 30 * len(methods) + 16 if methods else 0
    h = 54 + attr_h + meth_h
    c.rect(x, y, w, h, 2)
    c.text(x + w / 2, y + 28, name, 24, True)
    c.line(x, y + 54, x + w, y + 54, 2)
    yy = y + 76
    for a in attrs:
        c.text(x + 16, yy, a, 19, anchor="ls")
        yy += 28
    if methods:
        c.line(x, y + 54 + attr_h, x + w, y + 54 + attr_h, 2)
        yy = y + 54 + attr_h + 28
        for m in methods:
            c.text(x + 16, yy, m, 19, anchor="ls")
            yy += 28
    return (x, y, w, h)


def use_case_diagram():
    c = Canvas("01_diagramme_cas_utilisation", 3400, 2200)
    c.text(1700, 60, "Diagramme de cas d'utilisation - Learnix AI", 44, True)
    c.rect(430, 155, 2540, 1880, 3)
    c.text(1700, 200, "Système Learnix AI", 32, True)

    groups = [
        ("Administration", 560, 250, 950, 350, ["Gérer écoles", "Créer école", "Valider demande école", "Gérer utilisateurs", "Consulter statistiques"]),
        ("Gestion scolaire", 560, 660, 1220, 350, ["Gérer classes", "Gérer modules", "Gérer enseignants", "Gérer étudiants", "Générer emploi du temps"]),
        ("Pédagogie", 560, 1070, 1100, 350, ["Créer cours", "Importer PDF", "Générer quiz", "Générer examens", "Corriger automatiquement"]),
        ("Apprentissage", 560, 1480, 1000, 350, ["Consulter résultats", "Utiliser assistant IA", "Recevoir recommandations", "Suivre progression"]),
        ("Services IA", 1900, 1200, 820, 350, ["Générer quiz", "Générer examens", "Corriger automatiquement", "Utiliser assistant IA"]),
    ]
    group_pos = {}
    for title, x, y, w, h, labels in groups:
        c.rect(x, y, w, h, 2)
        c.text(x + w / 2, y + 35, title, 27, True)
        group_pos[title] = (x, y, w, h)
        cols = 3 if len(labels) > 4 else 2
        for i, label in enumerate(labels):
            col = i % cols
            row = i // cols
            ucx = x + 155 + col * 260
            ucy = y + 125 + row * 130
            c.ellipse(ucx - 118, ucy - 48, 236, 96, 2)
            c.text(ucx, ucy, label, 22, max_width=195)

    actors = [
        ("Administrateur", 150, 350),
        ("Directeur", 150, 720),
        ("Enseignant", 150, 1120),
        ("Élève", 150, 1500),
        ("Enseignant invité", 3220, 1000),
        ("Élève invité", 3220, 1370),
        ("Système IA", 3220, 1740),
    ]
    for label, x, y in actors:
        c.actor(x, y, label)

    def link_to_group(actor_x, actor_y, group, side):
        x, y, w, h = group_pos[group]
        gx = x if side == "left" else x + w
        gy = y + h / 2
        start_x = 300 if actor_x < 1700 else 3090
        c.line(start_x, actor_y + 20, gx, int(gy), 2)

    link_to_group(150, 350, "Administration", "left")
    link_to_group(150, 720, "Gestion scolaire", "left")
    link_to_group(150, 1120, "Pédagogie", "left")
    link_to_group(150, 1500, "Apprentissage", "left")
    link_to_group(3220, 1000, "Pédagogie", "right")
    link_to_group(3220, 1370, "Apprentissage", "right")
    link_to_group(3220, 1740, "Services IA", "right")
    c.line(1900, 1375, 1560, 1655, 2, dash=True)
    c.text(1740, 1510, "<<include>>", 22)
    c.save()


def class_diagram():
    c = Canvas("02_diagramme_classes", 4200, 3000)
    c.text(2100, 60, "Diagramme de classes - Learnix AI", 42, True)
    boxes = {}
    data = [
        ("Role", ["+id: int", "+nom: string", "+description: string"], []),
        ("User", ["+id: int", "+nom: string", "+email: string", "+motDePasse: string", "+statut: string"], ["+login()", "+logout()"]),
        ("Admin", ["+permissions: string[]"], ["+gérerUtilisateurs()", "+gérerÉcoles()"]),
        ("Directeur", ["+statutValidation: string"], ["+soumettreDemandeÉcole()", "+gérerÉcole()"]),
        ("Enseignant", ["+statutAdhésion: string"], ["+créerCours()", "+demanderAdhésion()"]),
        ("Élève", ["+niveau: string"], ["+passerQuiz()", "+consulterRésultats()"]),
        ("EnseignantInvité", ["+domaine: string"], ["+créerCoursIndépendant()"]),
        ("ÉlèveInvité", ["+niveauChoisi: string"], ["+utiliserAssistantIA()"]),
        ("École", ["+id: int", "+nom: string", "+adresse: string", "+statut: string"], []),
        ("Classe", ["+id: int", "+nom: string", "+niveau: string"], []),
        ("Module", ["+id: int", "+nom: string", "+description: text"], []),
        ("Cours", ["+id: int", "+titre: string", "+contenu: text"], []),
        ("Quiz", ["+id: int", "+titre: string", "+durée: int"], []),
        ("Examen", ["+id: int", "+titre: string", "+date: datetime"], []),
        ("Question", ["+id: int", "+énoncé: text", "+type: string"], []),
        ("Réponse", ["+id: int", "+contenu: text", "+correcte: bool"], []),
        ("Résultat", ["+id: int", "+score: float", "+feedback: text"], []),
        ("ProfilIA", ["+id: int", "+niveauActuel: string", "+forces: json", "+faiblesses: json"], []),
        ("RecommandationIA", ["+id: int", "+type: string", "+contenu: text", "+priorité: int"], []),
        ("EmploiDuTemps", ["+id: int", "+semaine: string", "+statut: string"], []),
        ("Notification", ["+id: int", "+titre: string", "+message: text", "+lue: bool"], []),
    ]
    pos_by_name = {
        "Role": (200, 160), "User": (740, 160),
        "Admin": (120, 610), "Directeur": (550, 610), "Enseignant": (980, 610), "Élève": (1410, 610),
        "EnseignantInvité": (1840, 610), "ÉlèveInvité": (2270, 610),
        "École": (250, 1090), "Classe": (720, 1090), "Module": (1190, 1090), "Cours": (1660, 1090),
        "Quiz": (2130, 1090), "Examen": (2600, 1090),
        "Question": (2000, 1540), "Réponse": (2470, 1540), "Résultat": (2940, 1540),
        "ProfilIA": (980, 1540), "RecommandationIA": (1450, 1540),
        "EmploiDuTemps": (720, 1980), "Notification": (1840, 1980),
    }
    for name, attrs, methods in data:
        x, y = pos_by_name[name]
        boxes[name] = class_box(c, x, y, 340, name, attrs, methods)

    def center(name):
        x, y, w, h = boxes[name]
        return x + w / 2, y + h / 2

    def edge(name, side):
        x, y, w, h = boxes[name]
        return {
            "top": (x + w / 2, y),
            "bottom": (x + w / 2, y + h),
            "left": (x, y + h / 2),
            "right": (x + w, y + h / 2),
        }[side]

    def rel(a, b, label="", dash=False, arrow=False, a_side=None, b_side=None):
        x1, y1 = edge(a, a_side) if a_side else center(a)
        x2, y2 = edge(b, b_side) if b_side else center(b)
        if arrow:
            c.arrow(int(x1), int(y1), int(x2), int(y2), 2, dash, open_head=True)
        else:
            c.line(int(x1), int(y1), int(x2), int(y2), 2, dash)
        if label:
            c.text((x1 + x2) / 2, (y1 + y2) / 2 - 16, label, 18, max_width=200)

    for child in ["Admin", "Directeur", "Enseignant", "Élève", "EnseignantInvité", "ÉlèveInvité"]:
        rel(child, "User", "hérite", dash=True, arrow=True, a_side="top", b_side="bottom")
    rel("Role", "User", "1", a_side="right", b_side="left")
    rel("Directeur", "École", "dirige 1..*", a_side="bottom", b_side="top")
    rel("École", "Classe", "1..*", a_side="right", b_side="left")
    rel("Classe", "Module", "1..*", a_side="right", b_side="left")
    rel("Module", "Cours", "1..*", a_side="right", b_side="left")
    rel("Cours", "Quiz", "0..*", a_side="right", b_side="left")
    rel("Cours", "Examen", "0..*", a_side="right", b_side="left")
    rel("Quiz", "Question", "1..*", a_side="bottom", b_side="top")
    rel("Examen", "Question", "1..*", a_side="bottom", b_side="top")
    rel("Question", "Réponse", "1..*", a_side="right", b_side="left")
    rel("Question", "Résultat", "produit", a_side="right", b_side="left")
    rel("Élève", "Résultat", "0..*", a_side="bottom", b_side="top")
    rel("Élève", "ProfilIA", "1", a_side="bottom", b_side="top")
    rel("ProfilIA", "RecommandationIA", "0..*", a_side="right", b_side="left")
    rel("Classe", "EmploiDuTemps", "0..*", a_side="bottom", b_side="top")
    rel("User", "Notification", "0..*", a_side="bottom", b_side="top")
    rel("Enseignant", "Module", "enseigne", a_side="bottom", b_side="top")
    rel("Élève", "Module", "suit", a_side="bottom", b_side="top")
    c.save()


def sequence_diagram_school():
    c = Canvas("03_sequence_creation_ecole", 2600, 1600)
    c.text(1300, 60, "Séquence - Création d'école et validation administrateur", 40, True)
    participants = [("Directeur", 300), ("Interface", 800), ("Système", 1300), ("Base de données", 1800), ("Administrateur", 2300)]
    sequence_base(c, participants, 180, 1420)
    msgs = [
        (0, 1, "Soumettre demande de création d'école"),
        (1, 2, "Transmettre la demande"),
        (2, 3, "Enregistrer statut: en attente"),
        (2, 4, "Notifier une nouvelle demande"),
        (4, 2, "Accepter ou rejeter la demande"),
        (2, 3, "Mettre à jour le statut"),
        (2, 3, "Créer l'école si demande acceptée"),
        (2, 0, "Activer tableau de bord Directeur"),
    ]
    draw_messages(c, participants, msgs, 300, 120)
    c.save()


def sequence_diagram_learning():
    c = Canvas("04_sequence_apprentissage_ia", 2600, 1700)
    c.text(1300, 60, "Séquence - Parcours d'apprentissage étudiant avec IA", 40, True)
    participants = [("Élève", 260), ("Interface", 700), ("Système", 1140), ("Système IA", 1600), ("Base de données", 2120)]
    sequence_base(c, participants, 180, 1520)
    msgs = [
        (0, 1, "Importer un PDF"),
        (1, 2, "Envoyer le fichier"),
        (2, 2, "Extraire le contenu"),
        (2, 3, "Demander quiz et exercices personnalisés"),
        (3, 2, "Retourner questions générées"),
        (2, 0, "Afficher quiz / exercices"),
        (0, 2, "Soumettre réponses"),
        (2, 3, "Corriger automatiquement"),
        (3, 2, "Score, feedback, faiblesses"),
        (2, 4, "Stocker tentative et résultat"),
        (2, 3, "Mettre à jour ProfilIA"),
        (3, 2, "Générer recommandations"),
        (2, 0, "Afficher feedback et recommandations"),
    ]
    draw_messages(c, participants, msgs, 290, 95)
    c.save()


def sequence_diagram_teacher():
    c = Canvas("05_sequence_validation_enseignant", 2500, 1500)
    c.text(1250, 60, "Séquence - Validation d'un enseignant par le Directeur", 40, True)
    participants = [("Enseignant", 300), ("Interface", 760), ("Système", 1220), ("Base de données", 1700), ("Directeur", 2180)]
    sequence_base(c, participants, 180, 1320)
    msgs = [
        (0, 1, "Demander à rejoindre une école"),
        (1, 2, "Transmettre la demande"),
        (2, 3, "Enregistrer statut: en attente"),
        (2, 4, "Notifier le Directeur"),
        (4, 2, "Approuver ou rejeter"),
        (2, 3, "Mettre à jour demande enseignant"),
        (2, 3, "Lier enseignant à l'école si approuvé"),
        (2, 0, "Activer accès tableau de bord enseignant"),
    ]
    draw_messages(c, participants, msgs, 290, 115)
    c.save()


def sequence_base(c: Canvas, participants, top, bottom):
    for label, x in participants:
        c.rect(x - 145, top - 70, 290, 72, 2)
        c.text(x, top - 34, label, 24, True, max_width=245)
        c.line(x, top + 2, x, bottom, 2, dash=True)


def draw_messages(c: Canvas, participants, msgs, start_y, gap):
    xs = [x for _, x in participants]
    y = start_y
    for a, b, label in msgs:
        x1, x2 = xs[a], xs[b]
        if a == b:
            c.line(x1, y, x1 + 130, y, 2)
            c.line(x1 + 130, y, x1 + 130, y + 42, 2)
            c.arrow(x1 + 130, y + 42, x1, y + 42, 2)
            c.text(x1 + 160, y + 15, label, 20, anchor="ls", max_width=360)
        else:
            c.arrow(x1, y, x2, y, 2)
            c.text((x1 + x2) / 2, y - 24, label, 20, max_width=420)
        y += gap


def activity_diagram():
    c = Canvas("06_diagramme_activite_global", 2600, 2100)
    c.text(1300, 60, "Diagramme d'activité - Flux global Learnix AI", 40, True)

    def action(x, y, w, h, label):
        c.rect(x - w / 2, y - h / 2, w, h, 2)
        c.text(x, y, label, 24, max_width=w - 40)

    def diamond(x, y, w, h, label):
        c.polygon([(x, y - h / 2), (x + w / 2, y), (x, y + h / 2), (x - w / 2, y)], 2)
        c.text(x, y, label, 21, max_width=w - 45)

    c.ellipse(1240, 120, 120, 60, 2, "black")
    action(1300, 270, 460, 90, "Inscription ou connexion")
    action(1300, 430, 460, 90, "Identifier le rôle")
    diamond(1300, 620, 430, 150, "Quel rôle ?")
    branches = [
        (450, 850, "Administrateur", "Tableau de bord administrateur"),
        (850, 850, "Directeur", "École approuvée ?"),
        (1250, 850, "Enseignant", "Enseignant validé ?"),
        (1650, 850, "Élève", "Élève affecté ?"),
        (2050, 850, "Invité", "Mode invité"),
    ]
    c.arrow(1300, 180, 1300, 225)
    c.arrow(1300, 315, 1300, 385)
    c.arrow(1300, 475, 1300, 545)
    for x, y, role, label in branches:
        c.arrow(1300, 695, x, 780)
        c.text((1300 + x) / 2, 750, role, 20)
        if "?" in label:
            diamond(x, y, 300, 130, label)
        else:
            action(x, y, 330, 90, label)

    action(450, 1090, 350, 90, "Gérer plateforme")
    action(850, 1090, 360, 90, "Accès tableau de bord Directeur")
    action(850, 1260, 360, 90, "Soumettre demande école")
    action(1250, 1090, 360, 90, "Accès tableau de bord Enseignant")
    action(1250, 1260, 360, 90, "Demander à rejoindre une école")
    action(1650, 1090, 350, 90, "Accès tableau de bord Élève")
    action(1650, 1260, 350, 90, "Mode Élève invité")
    action(2050, 1090, 350, 90, "Tableau de bord invité")
    action(1300, 1500, 520, 90, "Utiliser assistant IA, quiz, exercices")
    action(1300, 1660, 520, 90, "Stocker résultats et historique")
    action(1300, 1820, 520, 90, "Mettre à jour progression et recommandations")
    c.ellipse(1240, 1950, 120, 60, 2)
    c.ellipse(1255, 1965, 90, 30, 2, "black")

    c.arrow(450, 895, 450, 1045)
    c.arrow(850, 915, 850, 1045)
    c.text(760, 990, "Oui", 20)
    c.arrow(850, 915, 850, 1215)
    c.text(920, 990, "Non", 20)
    c.arrow(1250, 915, 1250, 1045)
    c.text(1160, 990, "Oui", 20)
    c.arrow(1250, 915, 1250, 1215)
    c.text(1320, 990, "Non", 20)
    c.arrow(1650, 915, 1650, 1045)
    c.text(1560, 990, "Oui", 20)
    c.arrow(1650, 915, 1650, 1215)
    c.text(1720, 990, "Non", 20)
    c.arrow(2050, 895, 2050, 1045)
    for x, y in [(450, 1135), (850, 1135), (850, 1305), (1250, 1135), (1250, 1305), (1650, 1135), (1650, 1305), (2050, 1135)]:
        c.arrow(x, y, 1300, 1455)
    c.arrow(1300, 1545, 1300, 1615)
    c.arrow(1300, 1705, 1300, 1775)
    c.arrow(1300, 1865, 1300, 1950)
    c.save()


def erd_diagram():
    c = Canvas("07_erd_base_donnees_mysql", 3600, 2600)
    c.text(1800, 60, "Diagramme ERD - Schéma MySQL Learnix AI", 42, True)
    tables = {
        "roles": ["PK id", "name", "description"],
        "users": ["PK id", "FK role_id", "FK school_id", "full_name", "email", "status"],
        "schools": ["PK id", "FK director_id", "name", "address", "status"],
        "school_requests": ["PK id", "FK director_id", "FK reviewed_by", "school_name", "status"],
        "classes": ["PK id", "FK school_id", "name", "level", "academic_year"],
        "modules": ["PK id", "FK school_id", "name", "level"],
        "class_students": ["PK class_id", "PK student_id", "assigned_at"],
        "class_teachers": ["PK class_id", "PK teacher_id", "assigned_at"],
        "module_teachers": ["PK module_id", "PK teacher_id", "assigned_at"],
        "courses": ["PK id", "FK module_id", "FK teacher_id", "title"],
        "course_files": ["PK id", "FK course_id", "file_name", "file_path"],
        "quizzes": ["PK id", "FK course_id", "FK module_id", "FK created_by", "title"],
        "exams": ["PK id", "FK course_id", "FK module_id", "FK created_by", "title"],
        "questions": ["PK id", "FK quiz_id", "FK exam_id", "statement"],
        "answers": ["PK id", "FK question_id", "content", "is_correct"],
        "attempts": ["PK id", "FK student_id", "FK quiz_id", "FK exam_id"],
        "results": ["PK id", "FK attempt_id", "score", "feedback"],
        "ai_profiles": ["PK id", "FK student_id", "strengths", "weaknesses"],
        "ai_recommendations": ["PK id", "FK ai_profile_id", "content", "priority"],
        "schedules": ["PK id", "FK class_id", "week_label", "status"],
        "schedule_items": ["PK id", "FK schedule_id", "FK teacher_id", "FK module_id"],
        "notifications": ["PK id", "FK user_id", "title", "is_read"],
    }
    positions = {}
    cols = [80, 650, 1220, 1790, 2360, 2930]
    rows = [150, 600, 1050, 1500]
    for i, (name, fields) in enumerate(tables.items()):
        x = cols[i % 6]
        y = rows[i // 6]
        h = 70 + 34 * len(fields)
        c.rect(x, y, 430, h, 2)
        c.rect(x, y, 430, 52, 2, "white")
        c.text(x + 215, y + 28, name, 25, True)
        yy = y + 82
        for f in fields:
            c.text(x + 22, yy, f, 20, anchor="ls")
            yy += 34
        positions[name] = (x, y, 430, h)

    def center_edge(a, b):
        ax, ay, aw, ah = positions[a]
        bx, by, bw, bh = positions[b]
        return ax + aw / 2, ay + ah / 2, bx + bw / 2, by + bh / 2

    def rel(a, b, label):
        x1, y1, x2, y2 = center_edge(a, b)
        c.line(int(x1), int(y1), int(x2), int(y2), 2)
        c.text((x1 + x2) / 2, (y1 + y2) / 2 - 12, label, 18, max_width=150)

    relationships = [
        ("roles", "users", "1,N"), ("users", "schools", "1,N"), ("users", "school_requests", "1,N"),
        ("schools", "classes", "1,N"), ("schools", "modules", "1,N"), ("classes", "class_students", "1,N"),
        ("users", "class_students", "1,N"), ("classes", "class_teachers", "1,N"), ("users", "class_teachers", "1,N"),
        ("modules", "module_teachers", "1,N"), ("users", "module_teachers", "1,N"), ("modules", "courses", "1,N"),
        ("users", "courses", "1,N"), ("courses", "course_files", "1,N"), ("courses", "quizzes", "1,N"),
        ("modules", "quizzes", "1,N"), ("courses", "exams", "1,N"), ("modules", "exams", "1,N"),
        ("quizzes", "questions", "1,N"), ("exams", "questions", "1,N"), ("questions", "answers", "1,N"),
        ("users", "attempts", "1,N"), ("quizzes", "attempts", "1,N"), ("exams", "attempts", "1,N"),
        ("attempts", "results", "1,1"), ("users", "ai_profiles", "1,1"), ("ai_profiles", "ai_recommendations", "1,N"),
        ("classes", "schedules", "1,N"), ("schedules", "schedule_items", "1,N"), ("users", "notifications", "1,N"),
    ]
    for a, b, label in relationships:
        rel(a, b, label)
    c.save()


def main():
    use_case_diagram()
    class_diagram()
    sequence_diagram_school()
    sequence_diagram_learning()
    sequence_diagram_teacher()
    activity_diagram()
    erd_diagram()


if __name__ == "__main__":
    main()
