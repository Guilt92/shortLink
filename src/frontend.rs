use axum::response::Html;
use maud::html;

pub async fn index() -> Html<String> {
    Html(
        html! {
            html lang="en" {
                head {
                    meta charset="UTF-8";
                    meta name="viewport" content="width=device-width, initial-scale=1.0";
                    title { "Short Link Service" }
                    link rel="stylesheet" href="/static/style.css";
                    script src="https://cdn.jsdelivr.net/npm/particles.js" {}
                    script defer src="/static/script.js" {}
                }
                body {
                    div id="particles-js" {}
                    div class="container" {
                        h1 { "ShortLink Generator" }
                        div class="email-box" {
                            input type="text" placeholder=" Enter your URL";
                            button { "Go" }
                        }
                    }
                }
            }
        }
        .into_string(),
    )
}
