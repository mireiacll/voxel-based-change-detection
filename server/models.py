"""
models.py — SQLAlchemy ORM models

Two tables:
  sites        — one row per physical waste-site location
  survey_dates — one row per drone flight / point cloud capture

Tile files (tileset.json + .glb) stay on disk.
The DB stores the paths to those files plus all display metadata.
This makes it trivial to add a new survey without editing config.js.
"""

from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Site(Base):
    """One physical waste-site location (e.g. 둔포면)."""

    __tablename__ = "sites"

    # Natural key — short ASCII id used in file paths too (e.g. "dunpo")
    id:          Mapped[str] = mapped_column(String(64),  primary_key=True)
    label:       Mapped[str] = mapped_column(Text,        nullable=False)   # Korean + English display label
    label_en:    Mapped[str] = mapped_column(Text,        nullable=False)   # English only (used in status bar)

    # Camera home position
    camera_lon:    Mapped[float] = mapped_column(Float, nullable=False)
    camera_lat:    Mapped[float] = mapped_column(Float, nullable=False)
    camera_height: Mapped[float] = mapped_column(Float, nullable=False)

    # Default mesh Z offset for this site
    mesh_z_offset: Mapped[float | None] = mapped_column(Float, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )

    # ── Relationship ──────────────────────────────────────────────────────
    dates: Mapped[list["SurveyDate"]] = relationship(
        "SurveyDate",
        back_populates="site",
        order_by="SurveyDate.date_code",
        cascade="all, delete-orphan",
    )

    def to_dict(self) -> dict:
        return {
            "id":       self.id,
            "label":    self.label,
            "labelEn":  self.label_en,
            "meshZOffset": self.mesh_z_offset,
            "camera": {
                "lon":    self.camera_lon,
                "lat":    self.camera_lat,
                "height": self.camera_height,
            },
            "dates": [d.to_dict() for d in self.dates],
        }


class SurveyDate(Base):
    """
    One drone survey / point-cloud capture for a site.

    Paths are relative to the Vite public/ directory so the browser
    can fetch 3D Tiles directly from the Vite dev server or from
    whatever static host serves the public/ folder.

    Example:
      mesh_path        = "data/dunpo/251106/3d_mesh/tiles/tileset.json"
      point_cloud_path = "data/dunpo/251106/point_cloud/tiles/tileset.json"
    """

    __tablename__ = "survey_dates"
    __table_args__ = (
        UniqueConstraint("site_id", "date_code", name="uq_site_date"),
    )

    id:        Mapped[str] = mapped_column(String(64), primary_key=True)  # e.g. "251106"
    site_id:   Mapped[str] = mapped_column(
        String(64), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False, index=True
    )
    date_code: Mapped[str] = mapped_column(String(16), nullable=False)     # e.g. "251106"
    label:     Mapped[str] = mapped_column(Text,        nullable=False)     # e.g. "Nov 6, 2025"

    # Paths relative to Vite public/ (also used by server to resolve disk paths)
    mesh_path:        Mapped[str | None] = mapped_column(Text, nullable=True)
    point_cloud_path: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Per-date Z offset override — NULL means "use CONFIG.DEFAULTS.MESH_Z_OFFSET"
    #mesh_z_offset: Mapped[float | None] = mapped_column(Float, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )

    # ── Relationship ──────────────────────────────────────────────────────
    site: Mapped["Site"] = relationship("Site", back_populates="dates")

    def to_dict(self) -> dict:
        return {
            "id":           self.date_code,   # frontend uses date_code as the id
            "label":        self.label,
            "mesh":         self.mesh_path,
            "pointCloud":   self.point_cloud_path,
            #"meshZOffset":  self.mesh_z_offset,   # None → frontend uses global default
        }