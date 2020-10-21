'use strict';

/**
 * @param {HTMLElement} target
 */
function ChartController(target, chartData) {
  const app = Object.assign(new EventEmitter(), {
    state: {
      night: !!localStorage.getItem('night')
    },
    dom: {
      // themeSwitch: document.querySelector('#theme_switch'),
      // // footer: document.querySelector('.footer'),
      graphsWrap: target,
    },
    charts: [],
    getTemplate,
    zoomChart,
    zoomOutChart,
  });

  // initTheme();

  initChart({
    id: 1,
    title: "Daily usage"
  });

  // function initTheme() {
  //   if (app.dom.themeSwitch) {
  //     app.dom.themeSwitch.addEventListener('click', (event) => {
  //       switchTheme();
  //       event.preventDefault();
  //     });
  //     switchTheme(app.state.night);
  //   }
  // }

  // function switchTheme(force) {
  //   app.state.night = document.body.classList.toggle('night', force);
  //   app.dom.themeSwitch.innerText = app.state.night ? 'Switch to Day Mode' : 'Switch to Night Mode';
  //   if (app.state.night) {
  //     localStorage.setItem('night', 1);
  //   } else {
  //     localStorage.removeItem('night');
  //   }
  //   app.dispatchEvent(new CustomEvent('theme_switch'));
  // }

  async function initChart(item) {
    const data = loadChartData(item);
    const chart = Chart(data, app);
    app.charts.push(chart);
    app.dom.graphsWrap.appendChild(chart.el);
  }

  async function zoomChart(item, zoomParams) {
    const data = await loadChartData(item);
    const childChart = Chart(data, app, zoomParams);
    const parentChart = findChart(item.id);
    parentChart.child = childChart;
    parentChart.el.replaceWith(childChart.el);
  }

  function zoomOutChart(id) {
    const parentChart = findChart(id);
    const childChart = parentChart.child;
    childChart.el.replaceWith(parentChart.el);
    parentChart.child = null;
    parentChart.redraw();
  }

  function findChart(id) {
    return app.charts.find((chart) => chart.id === id);
  }

  function loadChartData(item) {
    if (item.zoom) {
      return Object.assign({
        columns: chartData.getZoomedColumns(new Date(item.zoom)),
        types: chartData.getTypes(),
        names: chartData.getNames(),
        colors: chartData.getColors()
      }, item)
    }

    return Object.assign({
      columns: chartData.getOverviewColumns(),
      types: chartData.getTypes(),
      names: chartData.getNames(),
      colors: chartData.getColors()
    }, item)
  }

  function getTemplate(name) {
    const template = document.querySelector(`#template_${name}`);
    return document.importNode(template.content, true);
  }

  function EventEmitter() {
    const { port1 } = new MessageChannel();

    return {
      dispatchEvent: port1.dispatchEvent.bind(port1),
      addEventListener: port1.addEventListener.bind(port1),
      removeEventListener: port1.removeEventListener.bind(port1)
    };
  }
}
