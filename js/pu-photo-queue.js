/* 푸른사진첩 — 업로드 대기열
   신호가 약해도 사진을 잃지 않기 위한 층이다.
   사진은 먼저 이 기기(IndexedDB)에 담고, 클라우드에 올라간 뒤에만 지운다.
   어디에 올리는지는 모른다 — 저장 함수를 주입받는다(저장 방식은 pu-photo-store.js 소관).
   기기 저장(idb)도 주입받는다 — 그래서 노드에서 가짜로 갈아끼워 검사할 수 있다. */
(function (global) {
  'use strict';

  var RETRY_BASE_MS = 5000;    // 첫 재시도까지 5초
  var RETRY_MAX_MS = 300000;   // 거듭 실패해도 5분에 한 번은 다시 시도

  /* create({save, idb, onChange, setTimeout}) → {enqueue, resume, retryNow, jobs}
     - save(job): Promise — 실전에서는 PuPhotoStore.savePhoto
     - idb: { all(), put(job), del(id) } — 모두 Promise
     - onChange(jobs): 상태가 바뀔 때마다 사본 배열로 알림 (화면 갱신용)
     job 상태: wait(차례 기다림) → up(올리는 중) → done / 실패 시 retry(기다렸다 다시 wait) */
  function create(opts) {
    opts = opts || {};
    var save = opts.save;
    var idb = opts.idb;
    var onChange = opts.onChange || function () {};
    var delay = opts.setTimeout || function (fn, ms) { return setTimeout(fn, ms); };

    var jobs = [];
    var running = false; // 한 번에 한 장씩 — 폰 회선에서 동시 업로드는 서로를 굶긴다

    function snapshot() { onChange(jobs.slice()); }

    /* 새 사진을 대기열에. 기기에 담긴 것을 확인한 뒤에만 올리기 시작한다 —
       반대로 하면 올리는 도중 앱이 닫혔을 때 올라가지도, 남지도 않은 사진이 생긴다. */
    function enqueue(job) {
      job.tries = 0;
      job.state = 'wait';
      return idb.put(job).then(function () {
        jobs.push(job);
        snapshot();
        kick();
        return job.id;
      });
    }

    function next() {
      for (var i = 0; i < jobs.length; i++) if (jobs[i].state === 'wait') return jobs[i];
      return null;
    }

    function kick() {
      if (running) return;
      var job = next();
      if (!job) return;
      running = true;
      job.state = 'up';
      snapshot();
      save(job).then(function () {
        job.state = 'done';
        running = false;
        /* 기기에서 지우는 것은 반드시 저장 성공 뒤 — 순서가 바뀌면 실패한 사진이 사라진다. */
        return idb.del(job.id).then(function () { snapshot(); kick(); });
      }).catch(function (e) {
        job.tries += 1;
        job.state = 'retry';
        job.error = (e && e.message) || String(e);
        running = false;
        snapshot();
        /* 5초 → 10초 → 20초 … 최대 5분. 신호가 돌아오면 retryNow가 바로 깨운다. */
        var wait = Math.min(RETRY_BASE_MS * Math.pow(2, job.tries - 1), RETRY_MAX_MS);
        delay(function () {
          if (job.state === 'retry') { job.state = 'wait'; snapshot(); kick(); }
        }, wait);
      });
    }

    /* 앱을 다시 열었을 때 — 못 올라간 사진을 기기에서 꺼내 이어서 올린다. */
    function resume() {
      return idb.all().then(function (saved) {
        (saved || []).forEach(function (j) {
          j.tries = j.tries || 0;
          j.state = 'wait';
          jobs.push(j);
        });
        snapshot();
        kick();
        return jobs.length;
      });
    }

    /* 신호가 돌아왔다(online 이벤트 등) — 기다리는 시간 없이 바로 다시 시도. */
    function retryNow() {
      var woke = false;
      for (var i = 0; i < jobs.length; i++) {
        if (jobs[i].state === 'retry') { jobs[i].state = 'wait'; woke = true; }
      }
      if (woke) { snapshot(); kick(); }
    }

    return { enqueue: enqueue, resume: resume, retryNow: retryNow, jobs: jobs };
  }

  global.PuPhotoQueue = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
