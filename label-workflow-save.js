// Shared, retry-safe persistence for the list and name-label workflows.
(() => {
  function create(items, sizes) {
    return {
      owner: typeof currentUser !== 'undefined' ? currentUser?.id || null : null,
      cloud: typeof cloudReady !== 'undefined' && cloudReady,
      labels: items.map(item => ({ id: crypto.randomUUID(), english: item.english.trim(),
        spanish: item.spanish || '', photo: item.photo || '' })),
      sizes: [...sizes], queueRows: null, prepared: false, busy: false, complete: false
    };
  }
  function checkOwner(job) {
    if (job.owner !== (currentUser?.id || null) || job.cloud !== cloudReady) {
      const error=new Error('Your session changed. Start a new label batch in this account.');
      error.code='SESSION_CHANGED';
      throw error;
    }
  }
  async function save(job, addToPrint) {
    if (job.busy || job.complete) return false;
    job.busy = true;
    try {
      checkOwner(job);
      if (!job.prepared) {
        for (const label of job.labels) label.photo = await prepareCloudPhoto(label.photo);
        job.prepared = true;
      }
      checkOwner(job);
      if (!job.queueRows) job.queueRows = job.labels.flatMap(label => job.sizes.map(size => ({
        id: crypto.randomUUID(), label_id: label.id, english: label.english,
        spanish: label.spanish, photo_data: label.photo, size
      })));
      if (job.cloud) {
        // Stable IDs make a retry safe even if a response is lost after a successful insert.
        const options = rows => ({ method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(rows) });
        await restFetch('labels?on_conflict=id', options(job.labels.map(({photo, ...label}) => ({...label, photo_data: photo}))), false);
        checkOwner(job);
        if (addToPrint) await restFetch('print_queue?on_conflict=id', options(job.queueRows), false);
        checkOwner(job);
        await loadCloudData();
        checkOwner(job);
      } else {
        library.push(...job.labels);
        if (addToPrint) queue.push(...job.queueRows.map(({photo_data, ...row}) => ({...row, photo: photo_data})));
        refreshLibrary(); refreshQueue();
      }
      job.complete = true;
      return true;
    } catch(error) {
      checkOwner(job);
      throw error;
    } finally { job.busy = false; }
  }
  window.LittleLabelWorkflowSave = { create, save };
})();
