#!/usr/bin/with-contenv bashio

echo "--- Korea Radio Service Starting under S6 v3 ---"

# HAOS 17에서는 exec을 통해 node를 s6의 직접 관리 대상으로 등록해야 합니다.
exec node /app/index.js
