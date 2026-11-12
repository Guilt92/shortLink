use axum::response::Html;
const ICON: &str = "data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 32 32%27%3E%3Crect width=%2732%27 height=%2732%27 rx=%277%27 fill=%27%23111827%27/%3E%3Cpath d=%27M13 19l6-6M12 15l-2 2a3.5 3.5 0 005 5l2-2M20 17l2-2a3.5 3.5 0 00-5-5l-2 2%27 stroke=%27white%27 stroke-width=%272.2%27 fill=%27none%27 stroke-linecap=%27round%27/%3E%3C/svg%3E";
use maud::html;

/// Public landing page: create an anonymous short link, or sign in to the dashboard.
pub async fn index() -> Html<String> {
    Html(
        html! {
            (maud::DOCTYPE)
            html lang="en" {
                head {
                    meta charset="UTF-8";
                    meta name="viewport" content="width=device-width, initial-scale=1.0";
                    title { "ShortLink" }
                    link rel="icon" href=(ICON);
                    link rel="stylesheet" href="/static/style.css";
                    script defer src="/static/script.js" {}
                }
                body {
                    header class="top" {
                        a class="brand" href="/" { "ShortLink" }
                        nav { a href="/app/login" { "Sign in" } a class="btn" href="/app/register" { "Get started" } }
                    }
                    main class="container" {
                        h1 class="title" { "Shorten a link" }
                        p class="sub" { "Paste a long URL and get a short one you can share." }
                        form id="shorten-form" class="box" novalidate {
                            input id="url" type="url" name="url" placeholder="https://example.com/a/very/long/url" aria-label="URL to shorten" required;
                            button id="go" type="submit" { "Shorten" }
                        }
                        p id="error" class="error" role="alert" hidden {}
                        div id="result" class="result" hidden {
                            a id="short" href="#" target="_blank" rel="noopener noreferrer" {}
                            button id="copy" type="button" { "Copy" }
                        }
                        p class="foot" { "Need analytics, QR codes or custom domains? " a href="/app/register" { "Create a free account" } "." }
                    }
                }
            }
        }
        .into_string(),
    )
}
