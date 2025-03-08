use actix_files::Files;
use actix_web::{get, App, HttpServer, Result as AwResult};
use maud::{html, Markup};
use std::io;

#[get("/")]
async fn index() -> AwResult<Markup> {
    Ok(html! {
        html lang="en" {
            head {
                meta charset="UTF-8";
                meta name="viewport" content="width=device-width, initial-scale=1.0";
                title { "Short Link Service" }
                link rel="stylesheet" href="/static/style.css";   
            }
            body {
                div id="particles-js" {}  
                div class="container" {
                    h1 { "Short Link Generator" }
                    div class="email-box" {
                        input type="text" placeholder="Enter your URL";
                        button { "Shorten" }
                    }
                }
                script src="https://cdn.jsdelivr.net/npm/particles.js";   
                script src="/static/script.js";  
            }
        }
    })
}

#[actix_web::main]
async fn main() -> io::Result<()> {
    HttpServer::new(|| {
        App::new()
            .service(index)
            .service(Files::new("/static", "./static")) 
    })
    .bind(("0.0.0.0", 8080))? 
    .run()
    .await
}
