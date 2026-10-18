--[[ Small JSON encoder/decoder for talking to Moments Studio (no outside libraries). ]]
local json = {}

local escapes = { ['"'] = '\\"', ['\\'] = '\\\\', ['\b'] = '\\b', ['\f'] = '\\f', ['\n'] = '\\n', ['\r'] = '\\r', ['\t'] = '\\t' }

local function isArray(t)
  local n = 0
  for k in pairs(t) do
    if type(k) ~= 'number' then return false end
    n = n + 1
  end
  return n == #t
end

local function encode(v)
  local t = type(v)
  if v == nil or v == json.null then return 'null' end
  if t == 'boolean' then return v and 'true' or 'false' end
  if t == 'number' then
    if v ~= v or v == math.huge or v == -math.huge then return 'null' end
    if math.floor(v) == v and math.abs(v) < 1e15 then return string.format('%d', v) end
    return string.format('%.14g', v)
  end
  if t == 'string' then
    return '"' .. v:gsub('[%c"\\]', function(c) return escapes[c] or string.format('\\u%04x', c:byte()) end) .. '"'
  end
  if t == 'table' then
    local out = {}
    if next(v) ~= nil and isArray(v) then
      for i = 1, #v do out[#out + 1] = encode(v[i]) end
      return '[' .. table.concat(out, ',') .. ']'
    end
    if next(v) == nil and getmetatable(v) == json.arrayMeta then return '[]' end
    for k, val in pairs(v) do out[#out + 1] = encode(tostring(k)) .. ':' .. encode(val) end
    return '{' .. table.concat(out, ',') .. '}'
  end
  error('json: cannot encode ' .. t)
end
json.encode = encode
json.null = setmetatable({}, { __tostring = function() return 'null' end })
json.arrayMeta = {}
function json.array(t) return setmetatable(t or {}, json.arrayMeta) end

local function decodeError(s, i, msg) error(string.format('json: %s at %d', msg, i)) end

local decodeValue
local function skip(s, i)
  local _, e = s:find('^[ \n\r\t]*', i)
  return e + 1
end

local function decodeString(s, i)
  local out, j = {}, i + 1
  while true do
    local c = s:sub(j, j)
    if c == '' then decodeError(s, j, 'unterminated string') end
    if c == '"' then return table.concat(out), j + 1 end
    if c == '\\' then
      local n = s:sub(j + 1, j + 1)
      local map = { b = '\b', f = '\f', n = '\n', r = '\r', t = '\t', ['"'] = '"', ['\\'] = '\\', ['/'] = '/' }
      if map[n] then out[#out + 1] = map[n]; j = j + 2
      elseif n == 'u' then
        local code = tonumber(s:sub(j + 2, j + 5), 16)
        j = j + 6
        -- Surrogate pairs (emoji etc.)
        if code >= 0xD800 and code <= 0xDBFF and s:sub(j, j + 1) == '\\u' then
          local low = tonumber(s:sub(j + 2, j + 5), 16)
          code = 0x10000 + (code - 0xD800) * 0x400 + (low - 0xDC00)
          j = j + 6
        end
        if code < 0x80 then out[#out + 1] = string.char(code)
        elseif code < 0x800 then out[#out + 1] = string.char(0xC0 + math.floor(code / 0x40), 0x80 + code % 0x40)
        elseif code < 0x10000 then out[#out + 1] = string.char(0xE0 + math.floor(code / 0x1000), 0x80 + math.floor(code / 0x40) % 0x40, 0x80 + code % 0x40)
        else out[#out + 1] = string.char(0xF0 + math.floor(code / 0x40000), 0x80 + math.floor(code / 0x1000) % 0x40, 0x80 + math.floor(code / 0x40) % 0x40, 0x80 + code % 0x40) end
      else decodeError(s, j, 'bad escape') end
    else
      out[#out + 1] = c
      j = j + 1
    end
  end
end

function decodeValue(s, i)
  i = skip(s, i)
  local c = s:sub(i, i)
  if c == '{' then
    local obj = {}
    i = skip(s, i + 1)
    if s:sub(i, i) == '}' then return obj, i + 1 end
    while true do
      local key
      key, i = decodeString(s, skip(s, i))
      i = skip(s, i)
      if s:sub(i, i) ~= ':' then decodeError(s, i, 'expected :') end
      obj[key], i = decodeValue(s, i + 1)
      i = skip(s, i)
      local d = s:sub(i, i)
      if d == '}' then return obj, i + 1 end
      if d ~= ',' then decodeError(s, i, 'expected ,') end
      i = i + 1
    end
  elseif c == '[' then
    local arr = {}
    i = skip(s, i + 1)
    if s:sub(i, i) == ']' then return arr, i + 1 end
    while true do
      arr[#arr + 1], i = decodeValue(s, i)
      i = skip(s, i)
      local d = s:sub(i, i)
      if d == ']' then return arr, i + 1 end
      if d ~= ',' then decodeError(s, i, 'expected ,') end
      i = i + 1
    end
  elseif c == '"' then return decodeString(s, i)
  elseif s:sub(i, i + 3) == 'true' then return true, i + 4
  elseif s:sub(i, i + 4) == 'false' then return false, i + 5
  elseif s:sub(i, i + 3) == 'null' then return nil, i + 4
  else
    local num = s:match('^-?%d+%.?%d*[eE]?[-+]?%d*', i)
    if not num or num == '' then decodeError(s, i, 'unexpected character') end
    return tonumber(num), i + #num
  end
end

function json.decode(s)
  if type(s) ~= 'string' then return nil end
  local ok, v = pcall(function() return (decodeValue(s, 1)) end)
  if ok then return v end
  return nil
end

return json
