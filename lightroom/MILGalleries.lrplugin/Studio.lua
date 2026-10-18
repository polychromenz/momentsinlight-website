--[[ Talking to Moments Studio: settings and the HTTP calls (with retries). ]]
local LrHttp  = import 'LrHttp'
local LrPrefs = import 'LrPrefs'
local LrTasks = import 'LrTasks'
local json    = require 'json'

local Studio = {}
Studio.SITE = 'https://www.momentsinlight.co.nz'

-- Tony's usual sections, in gallery order (editable in the Plug-in Manager). B+W sections follow
-- their colour section.
Studio.DEFAULT_SECTIONS = 'Getting Ready\nVenue\nWelcome\nCeremony\nGroups\nThe Couple\nPortraits\nReception\nCake\nNewlywed game'

function Studio.prefs()
  local p = LrPrefs.prefsForPlugin()
  if not p.sections or p.sections == '' then p.sections = Studio.DEFAULT_SECTIONS end
  return p
end

function Studio.sectionList()
  local list = {}
  for line in (Studio.prefs().sections .. '\n'):gmatch('([^\r\n]*)\r?\n') do
    local name = line:gsub('^%s+', ''):gsub('%s+$', '')
    if name ~= '' then list[#list + 1] = name end
  end
  return list
end

local function headers(extra)
  local h = { { field = 'x-mil-key', value = Studio.prefs().key or '' } }
  for _, x in ipairs(extra or {}) do h[#h + 1] = x end
  return h
end

-- POST /api/lr with a JSON body. Returns the decoded answer, or nil and a message.
function Studio.call(body, tries)
  tries = tries or 3
  local lastError
  for attempt = 1, tries do
    local result, hdrs = LrHttp.post(Studio.SITE .. '/api/lr', json.encode(body), headers({ { field = 'Content-Type', value = 'application/json' } }), 'POST', 60)
    local status = hdrs and hdrs.status
    local data = json.decode(result)
    if status and status >= 200 and status < 300 and data then return data end
    if data and data.error then lastError = data.error else lastError = 'No answer from the studio (' .. tostring(status or (hdrs and hdrs.error and hdrs.error.name) or 'network') .. ')' end
    -- A wrong key or a missing gallery won't fix itself.
    if status == 401 or status == 404 or status == 400 then break end
    LrTasks.sleep(2 * attempt)
  end
  return nil, lastError
end

-- Upload one size of a photo (the file at path). Returns true, or false and a message.
function Studio.upload(imageId, size, path, tries)
  local LrFileUtils = import 'LrFileUtils'
  local bytes = LrFileUtils.readFile(path)
  if not bytes or #bytes == 0 then return false, 'Lightroom made an empty file' end
  tries = tries or 4
  local lastError
  for attempt = 1, tries do
    local result, hdrs = LrHttp.post(Studio.SITE .. '/api/lr/file?id=' .. imageId .. '&size=' .. size, bytes,
      headers({ { field = 'Content-Type', value = 'image/jpeg' } }), 'POST', 300, #bytes)
    local status = hdrs and hdrs.status
    if status and status >= 200 and status < 300 then return true end
    local data = json.decode(result)
    lastError = (data and data.error) or ('upload failed (' .. tostring(status or 'network') .. ')')
    if status == 401 or status == 400 then break end
    LrTasks.sleep(3 * attempt)
  end
  return false, lastError
end

return Studio
