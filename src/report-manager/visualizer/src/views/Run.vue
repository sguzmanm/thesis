<template>
  <div class="run-container">
    <div v-if="loading">
      Loading...
    </div>
    <div v-else-if="error">
      <span>There was an error loading this run: {{ error }}</span>
      <button @click="rertyLoading">Retry</button>
    </div>
    <template v-else>

      <h2>Run details</h2>
      <div class="run-info">
        <div class="detials-card"><b>Run start date:</b> {{ run.startDate }} </div>
        <div class="detials-card"><b>Run end date:</b> {{ run.endDate }} </div>
        <div class="detials-card"><b>Seed:</b> 54319902875 </div>
        <div class="detials-card"><b>Events to be tried:</b> {{ run.numEvents }} </div>
        <div class="detials-card"><b>Base browser:</b> {{ run.baseBrowser }} </div>
        <div class="detials-card"><b>Browsers tested:</b> {{ testedBrowsers }} </div>
      </div>

      <h2>Logs</h2>
      <template v-if="logs && logs.chrome && logs.chrome.length > 0">
        <div @click="showLogs = !showLogs" class="log-show-button">
          <i :class="['material-icons', showLogs && 'rotated']">expand_more</i>
          <span>{{ showLogs ? 'Hide' : 'Show' }} {{ logs.chrome.length }} log line{{ logs.chrome.length > 1 ? 's' : '' }}</span>
        </div>
        <transition name="grow">
          <div class="log-container" v-if="showLogs">
            <div v-for="(log, i) in logs.chrome" :key="log.timestamp" class="log-line">
              {{ i+1 }} {{ log.message }}
            </div>
          </div>
        </transition>
      </template>
      <div class="log-container" v-else>
        There are no logs for this run
      </div>

      <h2>Events</h2>
      <label for="threshold-slider"> <b>Alert threshold:</b> {{threshold}}% </label>
      <input id="threshold-slider" type="range" step="0.05" min="0" max="100" v-model="threshold"/>
      <div class="test-table">
        <div class="row-container header">
          <div class="id column">Event ID</div>
          <div class="type column">Event type</div>
          <div class="mismatch column">Mismatch percentage (before)</div>
          <div class="mismatch column">Mismatch percentage (after)</div>
        </div>
        <div
          class="row-container event"
          v-for="{ id: eventID, eventType, before, after, browsers } in run.events"
          @click="$router.push({ name: 'Event', params: { eventID, browsers }})"
          :key="eventID"
        >
          <div class="id column">{{ eventID }}</div>
          <div class="type column">{{ eventType }}</div>
          <div :class="mismatchFormat(before)">{{ before }}%</div>
          <div :class="mismatchFormat(after)">{{ after }}%</div>
        </div>
      </div>

    </template>
  </div>
</template>

<script>
export default {
  name: 'Run',
  data() {
    return {
      loading: true,
      run: null,
      error: null,
      threshold: 10,
      showLogs: false,
      logs: [],
    };
  },
  computed: {
    testedBrowsers() {
      return this.run.browsers.join(',');
    },
  },
  methods: {
    mismatchFormat(rawPercentage) {
      const percentage = parseFloat(rawPercentage, 10);
      if (percentage > this.threshold) {
        return ['mismatch', 'column', 'over-threshold'];
      }

      return ['mismatch', 'column'];
    },
    retryLoading() {
      this.loading = true;
      this.loadRun();
    },
    async loadRun() {
      const { run } = this.$route.params;
      try {
        const response = await fetch(`runs/${run}/run.json`);
        this.run = await response.json();
        await Promise.all(this.run.events.map(async ({ id: eventID }, i) => {
          try {
            const beforeResponse = await fetch(`runs/${run}/snapshots/${eventID}/comparison_before.json`);
            const afterResponse = await fetch(`runs/${run}/snapshots/${eventID}/comparison_after.json`);
            const before = await beforeResponse.json();
            const after = await afterResponse.json();

            this.run.events[i].before = before.resemble.misMatchPercentage;
            this.run.events[i].after = after.resemble.misMatchPercentage;
          } catch (error) {
            console.error(`Error fetching event[${eventID}] details: `, error);
          }

          const logResponse = await fetch(`runs/${run}/log.json`);
          this.logs = await logResponse.json();
        }));
      } catch (error) {
        console.error(error);
        this.error = error;
      } finally {
        this.loading = false;
      }
    },
  },
  async mounted() {
    await this.loadRun();
  },
};
</script>

<style scoped>
.run-container {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: flex-start;
  width: 100%;
  padding: 0 32px;
  padding-top: 32px;
}

h2 {
  margin-bottom: 16px;
}

.run-info {
  display: flex;
  flex-direction: row;
  justify-content: flex-start;
  align-items: flex-start;
  flex-wrap: wrap;
  margin-left: -32px;
}

.detials-card {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  margin: 16px 32px;
}

.log-show-button {
  display: flex;
  flex-direction: row;
  justify-content: flex-start;
  align-items: center;
  margin-bottom: 16px;
  cursor: pointer;
}

.log-show-button .material-icons {
  font-size: 1.64rem;
  transition: 0.64s all;
}

.log-show-button .material-icons.rotated {
  transform: rotate(180deg);
}

.log-show-button span {
  text-decoration: underline;
}

.log-container {
  margin-bottom: 16px;
  max-height: 10000px;
}

.log-line {
  background-color: rgb(42, 42, 42);
  color: whitesmoke;
}

hr {
  width: 100%;
}

input {
  margin-bottom: 16px;
}

.test-table {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: flex-start;
  width: 100%;
}

.row-container {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  cursor: pointer;
}

.row-container.header .column {
  font-weight: bold;
}

.event:hover {
  background-color: rgb(235, 235, 235);
}

.column {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-self: stretch;
  padding: 8px;
  border-bottom: 0;
  text-align: center;
}

.row-container:first-of-type .column {
  cursor: auto;
}

.id {
  flex: 1;
}

.type  {
  flex: 4;
}

.comparison {
  flex: 16;
}

.mismatch {
  flex: 4;
}

.actions{
  display:flex;
  flex-direction: column;
  flex:1;
}

.actions > button{
  border:solid 1px black;
  background: rgb(159, 211, 86);

  display:flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;

  cursor:pointer;
}

.after {
  height: 240px;
}

.over-threshold {
  background-color: rgb(255, 158, 158);
}

/* Transitions */
.grow-enter-active, .grow-leave-active {
  transition: all 0.48s ease-in-out;
}

.grow-enter, .grow-leave-to {
  max-height: 0;
  opacity: 0;
}

.grow-enter-to, .grow-leave {
  max-height: calc(100vh - 400px);
}
</style>
