from urllib.parse import quote_plus

from settings_base import *


DB_ACL_PASSWORD = env.str("DB_ACL_PASSWORD")
SQLALCHEMY_DATABASE_URI = (
    "mysql+pymysql://acl:{}@mysql:3306/acl?charset=utf8".format(quote_plus(DB_ACL_PASSWORD))
)
SQLALCHEMY_BINDS = {"user": SQLALCHEMY_DATABASE_URI}
CACHE_REDIS_HOST = "redis"
CELERY = {
    **CELERY,
    "broker_url": "redis://redis:6379/2",
    "result_backend": "redis://redis:6379/2",
}
ONCE = {
    **ONCE,
    "settings": {**ONCE["settings"], "url": CELERY["broker_url"]},
}
