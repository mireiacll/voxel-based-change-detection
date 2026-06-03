"""
models.py — SQLAlchemy ORM models

Two tables:
  sites        — one row per physical waste-site location
  survey_dates — one row per drone flight / capture

Each survey date now has ONE dataset (either a 3D mesh or a point cloud),
stored as dataset_path + dataset_type.  Different dates within the same
project may have different types.
"""

from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Site(Base):
    """One physical waste-site location."""

    __tablename__ = "sites"

    id:          Mapped[str] = mapped_column(String(64),  primary_key=True)
    label:       Mapped[str] = mapped_column(Text,        nullable=False)
    label_en:    Mapped[str] = mapped_column(Text,        nullable=False)

    camera_lon:    Mapped[float] = mapped_column(Float, nullable=False)
    camera_lat:    Mapped[float] = mapped_column(Float, nullable=False)
    camera_height: Mapped[float] = mapped_column(Float, nullable=False)

    # Mesh Z offset used at load time (not exposed in the UI any more)
    mesh_z_offset: Mapped[float | None] = mapped_column(Float, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )

    dates: Mapped[list["SurveyDate"]] = relationship(
        "SurveyDate",
        back_populates="site",
        order_by="SurveyDate.date_code",
        cascade="all, delete-orphan",
    )

    def to_dict(self) -> dict:
        return {
            "id":          self.id,
            "label":       self.label,
            "labelEn":     self.label_en,
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
    One drone survey for a site.  Each date has exactly ONE dataset,
    which is either a 3D mesh or a point cloud.

    dataset_type: "mesh" | "pointcloud"
    dataset_path: path relative to public/ (e.g. "data/dunpo/251106/tiles/tileset.json")
    """

    __tablename__ = "survey_dates"
    __table_args__ = (
        UniqueConstraint("site_id", "date_code", name="uq_site_date"),
    )

    id:        Mapped[str] = mapped_column(String(64), primary_key=True)
    site_id:   Mapped[str] = mapped_column(
        String(64), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False, index=True
    )
    date_code: Mapped[str] = mapped_column(String(16), nullable=False)
    label:     Mapped[str] = mapped_column(Text,       nullable=False)

    # Single dataset per date
    dataset_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    dataset_type: Mapped[str | None] = mapped_column(
        String(16), nullable=True
    )  # "mesh" | "pointcloud"

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )

    site: Mapped["Site"] = relationship("Site", back_populates="dates")

    def to_dict(self) -> dict:
        return {
            "id":          self.date_code,
            "label":       self.label,
            "datasetPath": self.dataset_path,
            "datasetType": self.dataset_type,  # "mesh" | "pointcloud" | null
        }