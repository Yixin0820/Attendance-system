from app.schemas.base import CamelModel


class CertificateFileOut(CamelModel):
    id: str
    name: str
    url: str | None = None


class LeaveIn(CamelModel):
    """学委提交的一条请假。id 为空表示新增，否则覆盖同名旧记录。"""

    id: str | None = None
    student_name: str
    student_id: str = ""
    reason: str
    reason_detail: str | None = None
    extra_note: str | None = None
    shared_certificate: bool = False
    certificate_late: bool = False
    certificate_file_ids: list[str] = []


class AttendanceIn(CamelModel):
    class_id: str
    date: str
    expected: int
    actual: int
    leaves: list[LeaveIn] = []


class LeaveOut(CamelModel):
    id: str
    student_name: str
    student_id: str
    reason: str
    reason_detail: str | None = None
    extra_note: str | None = None
    shared_certificate: bool = False
    certificate_late: bool = False
    certificate_files: list[CertificateFileOut] = []
    checked: bool = False
    has_issue: bool = False
    issue_description: str | None = None
    issue_by: str | None = None


class PhoneViolationOut(CamelModel):
    student_name: str
    review_files: list[CertificateFileOut] = []
    review_at: str | None = None
    review_by: str | None = None


class AttendanceOut(CamelModel):
    id: str
    class_id: str
    class_name: str
    classroom: str
    date: str
    expected: int
    actual: int
    leave_count: int
    late_uploaded: bool = False
    uploaded_at: str = ""
    number_issue: bool = False
    number_issue_note: str | None = None
    number_issue_cancelled: bool = False
    number_issue_by: str | None = None
    leaves: list[LeaveOut] = []
    phone_violations: list[PhoneViolationOut] = []


class NumberIssueIn(CamelModel):
    note: str = ""
    cancel: bool = False


class TogglePhoneIn(CamelModel):
    student_name: str


class ExpectedChangeIn(CamelModel):
    class_id: str
    to_count: int
    reason: str


class ReviewIn(CamelModel):
    """上传检讨时提交的文件 id 列表。

    必须包一层模型：直接把 `file_ids: list[str]` 写在函数签名里，
    FastAPI 会把它当成整个请求体（裸数组），而不是对象里的一个字段。
    """

    file_ids: list[str] = []


class ExpectedChangeOut(CamelModel):
    id: str
    class_id: str
    class_name: str
    date: str
    from_count: int
    to_count: int
    reason: str
    by: str
    created_at: str
    acknowledged: bool
    acknowledged_at: str | None = None
    acknowledged_by: str | None = None


class LeaveVerifyIn(CamelModel):
    checked: bool = True
    has_issue: bool = False
    issue_description: str | None = None


class ReviewOut(CamelModel):
    id: str
    date: str
    class_id: str
    class_name: str
    classroom: str
    student_name: str
    files: list[CertificateFileOut] = []
    at: str
    by: str
