--[[
  Library > Plug-in Extras > Send to MIL Galleries

  Sends a wedding to Moments Studio as a client gallery (a draft until Tony puts it online):
    - the gallery = this catalog (one catalog per wedding), or the selected collection set
    - each collection = a section: green-labelled photos -> "Ceremony",
      purple-labelled photos -> "Ceremony B+W"; other labels are skipped
      (the same rules as the Wedding Collection Export plugin)
    - sections in the order of the standard list (plug-in settings), photos in Lightroom's order
  Each photo goes up in three sizes: full size (sRGB, JPEG quality 90), 2048px and 600px.
  Run it again any time: photos already up and not edited since are skipped, edited ones are
  replaced, and photos no longer in the collections can be removed from the gallery (it asks).
  Photos are made and sent a few at a time, so a big wedding can't stall Lightroom, and if it
  stops (or you press the X) it carries on from where it was next time.
]]
local LrApplication     = import 'LrApplication'
local LrBinding         = import 'LrBinding'
local LrDialogs         = import 'LrDialogs'
local LrExportSession   = import 'LrExportSession'
local LrFileUtils       = import 'LrFileUtils'
local LrFunctionContext = import 'LrFunctionContext'
local LrHttp            = import 'LrHttp'
local LrPathUtils       = import 'LrPathUtils'
local LrProgressScope   = import 'LrProgressScope'
local LrTasks           = import 'LrTasks'
local LrView            = import 'LrView'
local Studio            = require 'Studio'

local LABELS = { green = false, purple = true } -- label -> black and white?
local BATCH = 6                                  -- photos made and sent at a time
local TYPES = { 'Wedding', 'Portraits', 'Headshots', 'Events' }

local function exportSettings(size, folder)
  local s = {
    LR_export_destinationType       = 'specificFolder',
    LR_export_destinationPathPrefix = folder,
    LR_export_useSubfolder          = false,
    LR_collisionHandling            = 'rename',
    LR_renamingTokensOn             = false,
    LR_format                       = 'JPEG',
    LR_jpeg_quality                 = 0.9,
    LR_jpeg_useLimitSize            = false,
    LR_export_colorSpace            = 'sRGB',
    LR_export_bitDepth              = 8,
    LR_size_doConstrain             = false,
    LR_size_resolution              = 300,
    LR_size_resolutionUnits         = 'inch',
    LR_outputSharpeningOn           = true,
    LR_outputSharpeningMedia        = 'screen',
    LR_outputSharpeningLevel        = 2,
    LR_removeLocationMetadata       = true,
    LR_useWatermark                 = false,
    LR_reimportExportedPhoto        = false,
    LR_includeVideoFiles            = false,
  }
  if size ~= 'original' then
    local edge = size == 'web' and 2048 or 600
    s.LR_jpeg_quality      = size == 'web' and 0.86 or 0.8
    s.LR_size_doConstrain  = true
    s.LR_size_resizeType   = 'longEdge'
    s.LR_size_maxWidth     = edge
    s.LR_size_maxHeight    = edge
    s.LR_size_units        = 'pixels'
    s.LR_size_doNotEnlarge = true
    s.LR_size_resolution   = 72
  end
  return s
end

local function collect(sources, out, sets)
  for _, src in ipairs(sources) do
    local t = src.type and src:type()
    if t == 'LrCollection' then table.insert(out, src)
    elseif t == 'LrCollectionSet' then
      sets[#sets + 1] = src
      collect(src:getChildCollections(), out, sets)
      collect(src:getChildCollectionSets(), out, sets)
    end
  end
end

local function stripYear(name) return (name:gsub('^%d%d%d%d%s+', '')) end

LrTasks.startAsyncTask(function()
  LrFunctionContext.callWithContext('MIL send gallery', function(context)
    LrDialogs.attachErrorDialogToFunctionContext(context)
    local catalog = LrApplication.activeCatalog()
    local prefs = Studio.prefs()
    if not prefs.key or prefs.key == '' then
      LrDialogs.message('Send to MIL Galleries', 'First paste your studio key into File > Plug-in Manager > MIL Galleries (make one in the studio: Galleries > Defaults > Make a Lightroom key).', 'warning')
      return
    end

    -- Which collections: the selected ones / set, or every collection in the catalog.
    local colls, sets = {}, {}
    collect(catalog:getActiveSources(), colls, sets)
    local catalogName = LrPathUtils.removeExtension(LrPathUtils.leafName(catalog:getPath()))
    local galleryKey = catalog:getPath()
    local defaultName = stripYear(catalogName)
    if #sets > 0 then
      galleryKey = galleryKey .. '#set' .. tostring(sets[1].localIdentifier)
      defaultName = stripYear(sets[1]:getName())
    end
    if #colls == 0 then
      collect(catalog:getChildCollections(), colls, sets)
      collect(catalog:getChildCollectionSets(), colls, sets)
    end
    if #colls == 0 then
      LrDialogs.message('Send to MIL Galleries', 'There are no collections to send. Make a collection per section (Ceremony, Groups…) and label the photos green (colour) or purple (B+W).', 'warning')
      return
    end

    -- Sort photos into sections by label.
    local order = {}
    for i, name in ipairs(Studio.sectionList()) do order[name:lower()] = i end
    local sections, colour, mono, skipped, earliest = {}, 0, 0, 0, nil
    for ci, coll in ipairs(colls) do
      local photos = coll:getPhotos()
      local meta = catalog:batchGetRawMetadata(photos, { 'colorNameForLabel', 'isVideo', 'lastEditTime', 'dateTimeOriginal' })
      local buckets = { green = {}, purple = {} }
      for _, photo in ipairs(photos) do
        local m = meta[photo]
        local label = (not m.isVideo) and m.colorNameForLabel
        if label and buckets[label] then
          table.insert(buckets[label], { photo = photo, edited = m.lastEditTime })
          if m.dateTimeOriginal and (not earliest or m.dateTimeOriginal < earliest) then earliest = m.dateTimeOriginal end
        else skipped = skipped + 1 end
      end
      local rank = order[coll:getName():lower()] or (1000 + ci)
      for label, bw in pairs(LABELS) do
        local list = buckets[label]
        if #list > 0 then
          table.insert(sections, { key = tostring(coll.localIdentifier) .. (bw and ':m' or ':c'), collId = tostring(coll.localIdentifier),
            name = coll:getName() .. (bw and ' B+W' or ''), bw = bw, photos = list, rank = rank * 2 + (bw and 1 or 0) })
          if bw then mono = mono + #list else colour = colour + #list end
        end
      end
    end
    table.sort(sections, function(a, b) return a.rank < b.rank end)
    if #sections == 0 then
      LrDialogs.message('Send to MIL Galleries', 'None of the photos in these collections are labelled green or purple.', 'warning')
      return
    end

    -- Confirm the gallery's details.
    local f = LrView.osFactory()
    local props = LrBinding.makePropertyTable(context)
    props.name = defaultName
    props.type = 'Wedding'
    props.date = ''
    if earliest then
      local LrDate = import 'LrDate'
      props.date = LrDate.timeToUserFormat(earliest, '%Y-%m-%d')
    end
    local summary = string.format('%d section%s: %d colour and %d B+W photos.%s', #sections, #sections == 1 and '' or 's', colour, mono,
      skipped > 0 and string.format('\n%d other photos (not green or purple) are skipped.', skipped) or '')
    local answer = LrDialogs.presentModalDialog {
      title = 'Send to MIL Galleries',
      contents = f:column {
        bind_to_object = props, spacing = f:control_spacing(),
        f:row { f:static_text { title = 'Gallery name:', width = LrView.share 'l' }, f:edit_field { value = LrView.bind 'name', width_in_chars = 30 } },
        f:row { f:static_text { title = 'Type:', width = LrView.share 'l' }, f:popup_menu { value = LrView.bind 'type', items = TYPES } },
        f:row { f:static_text { title = 'Date (YYYY-MM-DD):', width = LrView.share 'l' }, f:edit_field { value = LrView.bind 'date', width_in_chars = 12 } },
        f:spacer { height = 6 },
        f:static_text { title = summary, height_in_lines = 3, width_in_chars = 50 },
        f:static_text { title = 'It goes to the studio as a draft: check it there, then Put online.\nRunning it again only sends new or edited photos.', height_in_lines = 2, width_in_chars = 50 },
      },
      actionVerb = 'Send',
    }
    if answer ~= 'ok' then return end

    local progress = LrProgressScope { title = 'Sending to MIL Galleries', functionContext = context }
    progress:setCaption('Connecting to the studio…')
    local g, err = Studio.call({ action = 'gallery', set_id = galleryKey, name = props.name, type = props.type, event_date = props.date })
    if not g then LrDialogs.message('Send to MIL Galleries', err or 'The studio didn’t answer.', 'critical') return end

    -- Sections, then each photo (the studio says which still need sending).
    local jobs, keep, failed, unchanged = {}, {}, {}, 0
    local total = colour + mono
    local done = 0
    for si, sec in ipairs(sections) do
      if progress:isCanceled() then break end
      local s, serr = Studio.call({ action = 'section', gallery_id = g.id, key = sec.key, name = sec.name, is_bw = sec.bw, order = si - 1 })
      if not s then LrDialogs.message('Send to MIL Galleries', serr or 'Couldn’t make the section ' .. sec.name, 'critical') return end
      for n, item in ipairs(sec.photos) do
        if progress:isCanceled() then break end
        local photo = item.photo
        local lrId = tostring(photo.localIdentifier) .. '@' .. sec.collId
        keep[#keep + 1] = lrId
        local dims = photo:getRawMetadata('croppedDimensions') or {}
        local r, ierr = Studio.call({ action = 'image', gallery_id = g.id, section_id = s.id, lightroom_id = lrId, checksum = tostring(item.edited or ''),
          filename = photo:getFormattedMetadata('fileName'), width = dims.width, height = dims.height, sort_order = n - 1 })
        if not r then table.insert(failed, photo:getFormattedMetadata('fileName') .. ': ' .. (ierr or '?'))
        elseif r.needs and #r.needs > 0 then table.insert(jobs, { photo = photo, id = r.id, name = photo:getFormattedMetadata('fileName') })
        else unchanged = unchanged + 1 end
        done = done + 1
        progress:setPortionComplete(done, total * 4)
        progress:setCaption(string.format('Checking %d of %d…', done, total))
      end
    end

    -- Make and send the photos that need it, a few at a time, in three sizes.
    local temp = LrPathUtils.child(LrPathUtils.getStandardFilePath('temp'), 'MIL Galleries')
    LrFileUtils.createAllDirectories(temp)
    local sent = 0
    local i = 1
    while i <= #jobs and not progress:isCanceled() do
      -- A batch of different photos (the same photo can be in two collections).
      local batch, seen = {}, {}
      while i <= #jobs and #batch < BATCH do
        local j = jobs[i]
        if seen[j.photo] then break end
        seen[j.photo] = true
        batch[#batch + 1] = j
        i = i + 1
      end
      local ok = {}
      for _, j in ipairs(batch) do ok[j] = true end
      for _, size in ipairs({ 'thumb', 'web', 'original' }) do
        if progress:isCanceled() then break end
        local photos, byPhoto = {}, {}
        for _, j in ipairs(batch) do if ok[j] then photos[#photos + 1] = j.photo; byPhoto[j.photo] = j end end
        if #photos == 0 then break end
        progress:setCaption(string.format('Sending %d of %d (%s)…', sent + 1, #jobs, size == 'original' and 'full size' or size == 'web' and 'web size' or 'thumbnail'))
        local session = LrExportSession { photosToExport = photos, exportSettings = exportSettings(size, temp) }
        for _, rendition in session:renditions() do
          local j = byPhoto[rendition.photo]
          local success, pathOrMessage = rendition:waitForRender()
          if success then
            local up, uerr = Studio.upload(j.id, size, pathOrMessage)
            LrFileUtils.delete(pathOrMessage)
            if not up then ok[j] = false; table.insert(failed, j.name .. ': ' .. (uerr or 'upload failed')) end
          else
            ok[j] = false
            table.insert(failed, j.name .. ': ' .. tostring(pathOrMessage))
          end
        end
      end
      for _, j in ipairs(batch) do if ok[j] then sent = sent + 1 end end
      progress:setPortionComplete(total + sent * 3, total + #jobs * 3)
    end
    local canceled = progress:isCanceled()
    progress:done()

    -- Photos in the gallery that are no longer in these collections.
    if not canceled then
      local fin = Studio.call({ action = 'finish', gallery_id = g.id, keep = keep })
      if fin and fin.extra and #fin.extra > 0 then
        local names = {}
        for k, x in ipairs(fin.extra) do if k <= 12 then names[#names + 1] = x.filename end end
        local a = LrDialogs.confirm('Remove photos from the gallery?',
          string.format('%d photo%s in the gallery %s no longer in these collections (or no longer labelled green or purple):\n\n%s%s\n\nRemove %s from the gallery?',
            #fin.extra, #fin.extra == 1 and ' is' or 's are', '', table.concat(names, '\n'), #fin.extra > 12 and '\n…' or '', #fin.extra == 1 and 'it' or 'them'),
          'Remove', 'Keep them')
        if a == 'ok' then
          local ids = {}
          for _, x in ipairs(fin.extra) do ids[#ids + 1] = x.id end
          Studio.call({ action = 'remove', gallery_id = g.id, ids = ids })
        end
      end
    end

    local lines = {}
    if canceled then lines[#lines + 1] = 'Stopped. Run Send to MIL Galleries again to carry on from where it got to.' end
    lines[#lines + 1] = string.format('%d photo%s sent, %d already up to date.', sent, sent == 1 and '' or 's', unchanged)
    if #failed > 0 then
      lines[#lines + 1] = string.format('\n%d didn’t go (run it again to retry them):', #failed)
      for k = 1, math.min(8, #failed) do lines[#lines + 1] = failed[k] end
    end
    lines[#lines + 1] = '\nThe gallery is in the studio' .. (g.status == 'online' and ' (online).' or ' as a draft: check it, then Put online.')
    local a = LrDialogs.confirm('Send to MIL Galleries', table.concat(lines, '\n'), 'Open it in the studio', 'Done')
    if a == 'ok' then LrHttp.openUrlInBrowser(g.studio) end
  end)
end)
