require "sweetbread"

task "start", "Build, watch, and serve.", ()->
  invoke "build"
  invoke "watch"
  invoke "serve"

task "build", "Compile everything.", ()->
  rm "public"

  compile "static", "source/**/*.*", (path)->
    copy path, replace path, "source/": "public/"

task "watch", "Recompile on changes.", ()->
  watch "source", "build", reload

task "serve", "Spin up a live reloading server.", ()->
  serve "public"
