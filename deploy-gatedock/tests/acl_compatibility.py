import hashlib
import os
import unittest
from unittest.mock import Mock, patch
from urllib.parse import parse_qs, urlparse

import requests

from autoapp import app
from api.tasks.acl import role_rebuild


class ACLCompatibilityTests(unittest.TestCase):
    def test_password_session_and_logout(self):
        password = os.environ["GATEDOCK_TEST_ADMIN_PASSWORD"]
        with requests.Session() as client:
            response = client.post(
                "http://web/api/v1/acl/login",
                json={
                    "username": "admin",
                    "password": hashlib.md5(password.encode()).hexdigest(),
                },
                timeout=15,
            )
            self.assertEqual(response.status_code, 200)
            self.assertTrue(response.json()["token"])
            self.assertIn("session", client.cookies)
            assets = client.get("http://web/api/oneterm/v1/asset", timeout=15)
            self.assertEqual(assets.status_code, 200)
            self.assertEqual(assets.json()["code"], 0)
            response = client.post("http://web/api/v1/acl/logout", timeout=15)
            self.assertEqual(response.status_code, 200)
            self.assertNotIn("session", client.cookies)
            self.assertEqual(
                client.get("http://web/api/oneterm/v1/asset", timeout=15).status_code,
                401,
            )

    def test_oidc_login_callback_and_state(self):
        config = {
            "client_id": "compatibility-test",
            "client_secret": "not-a-real-secret",
            "authorize_url": "https://idp.invalid/authorize",
            "token_url": "https://idp.invalid/token",
            "scopes": ["openid", "profile", "email"],
            "user_info": {
                "url": "https://idp.invalid/userinfo",
                "email": "email",
                "username": "name",
                "avatar": "picture",
            },
            "after_login": "/",
        }
        routing = "api.lib.perm.authentication.oauth2.routing"
        token_response = Mock(status_code=200)
        token_response.json.return_value = {"access_token": "test-token"}
        user_response = Mock(status_code=200)
        user_response.json.return_value = {
            "name": "admin",
            "email": "admin@example.invalid",
            "picture": "",
        }
        with app.test_client() as client, patch(
            routing + ".AuthenticateDataCRUD.get", return_value=config
        ), patch(routing + ".requests.post", return_value=token_response) as token, patch(
            routing + ".requests.get", return_value=user_response
        ):
            login = client.get(
                "/api/oidc/login",
                base_url="https://gatedock.example.com",
                headers={"Referer": "https://gatedock.example.com/user/login"},
            )
            self.assertEqual(login.status_code, 302)
            query = parse_qs(urlparse(login.location).query)
            callback_url = "https://gatedock.example.com/api/oidc/callback"
            self.assertEqual(query["redirect_uri"], [callback_url])
            self.assertEqual(
                client.get(
                    "/api/oidc/callback?state=invalid&code=test",
                    base_url="https://gatedock.example.com",
                ).status_code,
                401,
            )
            token.assert_not_called()
            callback = client.get(
                "/api/oidc/callback",
                query_string={"state": query["state"][0], "code": "test"},
                base_url="https://gatedock.example.com",
                headers={"X-Scheme": "https"},
            )
            self.assertEqual(callback.status_code, 302)
            self.assertEqual(token.call_args.kwargs["data"]["redirect_uri"], callback_url)
            with client.session_transaction(base_url="https://gatedock.example.com") as session:
                self.assertEqual(session["acl"]["userName"], "admin")

    def test_worker_rebuilds_permissions(self):
        with app.app_context():
            result = role_rebuild.apply_async(args=(1, 3), queue="acl_async")
            result.get(timeout=30)
            self.assertTrue(result.successful())


if __name__ == "__main__":
    unittest.main(verbosity=2)
