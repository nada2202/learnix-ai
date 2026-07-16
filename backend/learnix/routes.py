from .ai import ai_bp
from .platform import platform_bp
from .schedule import schedule_bp
from .schools import schools_bp
from .student import student_bp
from .notifications import notifications_bp
from .avatars import avatars_bp


def register_blueprints(app):
    app.register_blueprint(schools_bp)
    app.register_blueprint(schedule_bp)
    app.register_blueprint(ai_bp)
    app.register_blueprint(platform_bp)
    app.register_blueprint(student_bp)
    app.register_blueprint(notifications_bp)
    app.register_blueprint(avatars_bp)
