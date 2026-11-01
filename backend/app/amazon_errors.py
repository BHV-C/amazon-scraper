from __future__ import annotations

from urllib.parse import urljoin, urlparse


class AmazonCollectionError(Exception):
    """A classified Amazon collection failure safe to return to the client."""

    def __init__(
        self,
        code: str,
        message: str,
        action: str,
        *,
        status_code: int = 424,
        http_status: int | None = None,
    ) -> None:
        self.code = code
        self.message = message
        self.action = action
        self.status_code = status_code
        self.http_status = http_status
        super().__init__(message)


def _normalized_host(host: str | None) -> str:
    return (host or "").lower().removeprefix("www.").rstrip(".")


def _is_amazon_host(host: str | None) -> bool:
    normalized = _normalized_host(host)
    marketplaces = (
        "amazon.com", "amazon.ca", "amazon.com.mx", "amazon.co.uk", "amazon.de",
        "amazon.fr", "amazon.it", "amazon.es", "amazon.co.jp", "amazon.in",
        "amazon.com.au", "amazon.nl", "amazon.se", "amazon.pl", "amazon.sg",
        "amazon.com.br",
    )
    return any(
        normalized == domain or normalized.endswith(f".{domain}") 
               for domain in marketplaces
               )


def classify_amazon_response(response: object, expected_host: str) -> None:
    """Raise a specific error for blocked, redirected, or non-review responses."""
    status = int(getattr(response, "status_code"))
    current_url = str(getattr(response, "url"))
    headers = getattr(response, "headers")
    body = str(getattr(response, "text", ""))[:100_000].lower()
    current = urlparse(current_url)
    location = headers.get("location", "")
    target_url = urljoin(current_url, location) if location else ""
    target = urlparse(target_url)
    current_path = current.path.lower()
    target_path = target.path.lower()

    captcha_markers = (
        "validatecaptcha",
        "captcha",
        "enter the characters you see",
        "robot check",
        "automated access",
    )
    if any(marker in body for marker in captcha_markers) or any(
        marker in f"{current_path} {target_path}"
        for marker in ("captcha", "validatecaptcha")
    ):
        raise AmazonCollectionError(
            "SECURITY_CHALLENGE",
            "Amazon presented a security verification challenge. Collection stopped.",
            "Try again later or use an authorized review data provider.",
            http_status=status,
        )

    sign_in_paths = ("/ap/signin", "/ap/sign-up", "/gp/sign-in")
    if status == 401 or any(path in f"{current_path} {target_path}" for path in sign_in_paths):
        raise AmazonCollectionError(
            "AUTHENTICATION_REQUIRED",
            "Amazon requires sign-in to access this review page. Collection stopped.",
            "Upload a CSV/XLSX review file you are authorized to use, or use an authorized review data provider.",
            http_status=status,
        )

    if status == 429:
        raise AmazonCollectionError(
            "RATE_LIMITED",
            "Amazon temporarily limited the review request.",
            "Wait before trying again or use an authorized review data provider.",
            http_status=status,
        )

    if location and target.hostname:
        target_host = _normalized_host(target.hostname)
        expected = _normalized_host(expected_host)
        if _is_amazon_host(target.hostname) and target_host != expected:
            raise AmazonCollectionError(
                "MARKETPLACE_REDIRECT",
                f"Amazon redirected the request to the {target_host} marketplace. Collection stopped.",
                "Check the product's regional marketplace and retry with its correct product URL.",
                http_status=status,
            )
        if not _is_amazon_host(target.hostname):
            raise AmazonCollectionError(
                "EXTERNAL_REDIRECT",
                "Amazon redirected the request outside its marketplace. Collection stopped.",
                "Check the product URL or use an authorized review data provider.",
                http_status=status,
            )

    denial_markers = (
        "access denied",
        "request blocked",
        "you don't have permission",
        "not authorized to access",
    )
    if status == 403 or any(marker in body for marker in denial_markers):
        raise AmazonCollectionError(
            "REVIEW_ACCESS_RESTRICTED",
            "Amazon refused access to the requested review page. Collection stopped.",
            "Check your data source permissions or use an authorized review data provider.",
            http_status=status,
        )

    if status in {301, 302, 303, 307, 308}:
        raise AmazonCollectionError(
            "MARKETPLACE_REDIRECT",
            "Amazon redirected the review request. Collection stopped without following the redirect.",
            "Check the product's marketplace and try again with its correct product URL.",
            http_status=status,
        )

    if status >= 400:
        raise AmazonCollectionError(
            "AMAZON_HTTP_ERROR",
            f"Amazon returned HTTP {status} for the review request.",
            "Check the product URL and try again later, or use an authorized provider.",
            http_status=status,
        )
