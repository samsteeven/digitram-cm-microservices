from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request


class UserMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request.state.user = {
            "id": request.headers.get("x-user-id"),
            "role": request.headers.get("x-user-role"),
            "email": request.headers.get("x-user-email"),
        }
        response = await call_next(request)
        return response


def require_role(allowed_roles: list):
    async def role_dependency(request: Request):
        user = request.state.user
        if not user or not user.get("role"):
            from fastapi import HTTPException
            raise HTTPException(status_code=401, detail="Non authentifié.")
        if user["role"] not in allowed_roles:
            from fastapi import HTTPException
            raise HTTPException(
                status_code=403,
                detail=f"Accès refusé. Rôle requis: {allowed_roles}, actuel: {user['role']}"
            )
        return user
    return role_dependency
