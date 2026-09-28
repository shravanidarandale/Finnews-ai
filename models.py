"""Internal (non-API) models and exceptions shared by services and routes."""


class ServiceError(Exception):
    """Error with a user-safe message and an HTTP status code."""

    def __init__(self, message: str, status_code: int = 502) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
