use axum::response::Html;
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
