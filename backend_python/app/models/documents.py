from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import (
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    Boolean,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db import Base


class DocumentType(str, PyEnum):
    AHV_STATEMENT = "ahv_statement"
    BVG_STATEMENT = "bvg_statement"
    BANK_STATEMENT = "bank_statement"
    INSURANCE_POLICY = "insurance_policy"
    TAX_ASSESSMENT = "tax_assessment"
    OTHER = "other"


class OcrEngine(str, PyEnum):
    PYTHON_TESSERACT = "python_tesseract"
    PYTHON_PDFPLUMBER = "python_pdfplumber"
    GO_PDFCPU = "go_pdfcpu"


class ImportQueueStatus(str, PyEnum):
    PENDING = "pending"
    MAPPED = "mapped"
    REJECTED = "rejected"


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )

    doc_type: Mapped[DocumentType] = mapped_column(Enum(DocumentType), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)

    storage_path: Mapped[str] = mapped_column(String(512), nullable=False)

    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )

    # Statusflags, ob OCR und Review bereits erfolgt sind
    is_ocr_processed: Mapped[bool] = mapped_column(Boolean, default=False)
    is_reviewed: Mapped[bool] = mapped_column(Boolean, default=False)

    extra_meta: Mapped[dict | None] = mapped_column(
        JSONB().with_variant(JSONB, "postgresql"), nullable=True
    )

    ocr_results: Mapped[list["OcrExtraction"]] = relationship(
        "OcrExtraction", back_populates="document", cascade="all, delete-orphan"
    )


class OcrExtraction(Base):
    __tablename__ = "ocr_extractions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    document_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("documents.id", ondelete="CASCADE"), index=True
    )

    engine: Mapped[OcrEngine] = mapped_column(Enum(OcrEngine), nullable=False)

    raw_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    structured_data: Mapped[dict | None] = mapped_column(
        JSONB().with_variant(JSONB, "postgresql"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    reviewed_by_user_id: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )

    is_accepted: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    document: Mapped[Document] = relationship("Document", back_populates="ocr_results")


class ImportQueueItem(Base):
    __tablename__ = "import_queue_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[ImportQueueStatus] = mapped_column(
        Enum(ImportQueueStatus), default=ImportQueueStatus.PENDING
    )
    suggested_doc_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    target_field_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )

