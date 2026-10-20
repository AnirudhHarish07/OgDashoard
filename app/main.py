import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import errors
from app.config import settings
from app.db import ensure_database
from app.logging_config import setup_logging
from app.routers import map as map_router
from app.routers import meta as meta_router
from app.routers import overview as overview_router
from app.routers import comparison as comparison_router
from app.routers import states as states_router
from app.routers import seasonality as seasonality_router
from app.routers import economy as economy_router
from app.routers import covid as covid_router

setup_logging()
log = logging.getLogger("app")


@asynccontextmanager
async def lifespan(_: FastAPI):
    ensure_database()
    from app.services import data, geo
    data.frames()
    if settings.geo_path.exists():
        geo._base()
    log.info("startup complete", extra={"fields": {"db": str(settings.database_path)}})
    yield


app = FastAPI(title="India Tourism Dashboard API", version="1.0.0", lifespan=lifespan,
              description="Backend for the state-wise India tourism dashboard. All data comes from the bundled "
                          "dataset (data/india_tourism.db); every value is flagged with is_synthetic.")
app.add_middleware(CORSMiddleware, allow_origins=list(settings.cors_origins), allow_methods=["*"], allow_headers=["*"])
errors.install_handlers(app)


@app.middleware("http")
async def access_log(request, call_next):
    t = time.perf_counter()
    resp = await call_next(request)
    log.info("request", extra={"fields": {"method": request.method, "path": request.url.path,
                                          "status": resp.status_code, "ms": round((time.perf_counter() - t) * 1000, 1)}})
    return resp


for r in (meta_router, map_router, overview_router, comparison_router, states_router,
          seasonality_router, economy_router, covid_router):
    app.include_router(r.router)
