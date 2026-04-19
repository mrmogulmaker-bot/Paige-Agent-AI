-- Force sign out every user by deleting all auth sessions and refresh tokens.
-- Next page load forces re-authentication for everyone (including the platform owner).
DELETE FROM auth.refresh_tokens;
DELETE FROM auth.sessions;