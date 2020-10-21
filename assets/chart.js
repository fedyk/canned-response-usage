'use strict';

const DPR = window.devicePixelRatio;

const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, Roboto, Helvetica, Verdana, sans-serif';

const GRID_LINE_DAY_COLOR = 'rgba(24, 45, 59, .1)';
const GRID_LINE_NIGHT_COLOR = 'rgba(255, 255, 255, .1)';
const GRID_INTERVAL_HEIGHT = 50 * DPR;
const GRID_INTERVALS_NUM = 5;
const GRID_LINES_NUM = GRID_INTERVALS_NUM + 1;
const GRID_LINE_WIDTH = DPR;
const GRID_PERCENTAGE_INTERVAL_HEIGHT = 65 * DPR;
const GRID_PERCENTAGE_INTERVALS_NUM = 4;
const GRID_PERCENTAGE_LINES_NUM = GRID_PERCENTAGE_INTERVALS_NUM + 1;
const GRID_AXIS_TEXT_COLOR = 'rgba(37, 37, 41, 0.5)';
const GRID_AXIS_TEXT_NIGHT_COLOR = 'rgba(236, 242, 248, 0.5)';
const GRID_AXIS_LABEL_FONT_SIZE = 11 * DPR;
const GRID_AXIS_LABEL_FONT_LINE_HEIGHT = 15 * DPR;
const GRID_AXIS_LABEL_FONT = `${GRID_AXIS_LABEL_FONT_SIZE}px/${GRID_AXIS_LABEL_FONT_LINE_HEIGHT}px ${FONT_FAMILY}`;
const GRID_AXIS_X_HEIGHT = 20 * DPR;
const GRID_AXIS_X_LABEL_WIDTH = 50 * DPR;
const GRID_AXIS_X_LABEL_TOP_PADDING = 6 * DPR;
const GRID_AXIS_Y_LABEL_BOTTOM_PADDING = 4 * DPR;

const CHART_X_PADDING = 12 * DPR;
const CHART_COLUMN_LINE_WIDTH = 2 * DPR;

const CHART_COLUMN_BAR_OVERLAY_MASK_ALPHA = 0.6;
const CHART_COLUMN_BAR_OVERLAY_DAY_MASK = '#FFFFFF';
const CHART_COLUMN_BAR_OVERLAY_NIGHT_MASK = '#242F3E';

const CHART_SELECTED_POINT_RADIUS = 4 * DPR;
const CHART_SELECTED_POINT_DAY_FILL = '#fff';
const CHART_SELECTED_POINT_NIGHT_FILL = '#212f3f';
const CHART_SELECTED_PIE_PART_OFFSET = 10 * DPR;

const TIMELINE_COLUMN_LINE_WIDTH = DPR;
const TIMELINE_X_PADDING = 0;
const TIMELINE_Y_PADDING = 0;

const ANIMATION_VALUES_DURATION = 350;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
// const TIMEZONE_OFFSET = (new Date().getTimezoneOffset() / 60) * HOUR;
const TIMEZONE_OFFSET = 0

const template = document.createElement("div")

template.innerHTML = `<section class="chart_container">
  <h3 class="chart_header"></h3>
  <span class="chart_dates_range"></span>
  <div class="chart_canvas_shadow"></div>
  <div class="chart_point_popup" hidden></div>
  <canvas class="chart_canvas"></canvas>
  <div class="chart_timeline">
    <canvas class="chart_timeline_canvas"></canvas>
    <div class="chart_timeline_rest_left"></div>
    <div class="chart_timeline_handle">
      <div class="chart_timeline_handle_touch_area"></div>
    </div>
    <div class="chart_timeline_rest_right"></div>
  </div>
  <div class="chart_legend"></div>
</section>`

function Chart(data, app, zoomParams = null) {
  const container = document.importNode(template, true).querySelector('.chart_container');
  const canvas = container.querySelector('.chart_canvas');
  const timelineCanvas = container.querySelector('.chart_timeline_canvas');
  const header = container.querySelector('.chart_header');
  const selectedPointPopup = container.querySelector('.chart_point_popup');
  const chartCtx = canvas.getContext('2d');
  const timelineCtx = timelineCanvas.getContext('2d');
  const datesRangeContainer = container.querySelector('.chart_dates_range');

  const columnDisabled = zoomParams ? zoomParams.columnDisabled : {};
  const columnTransparency = {};

  const chartType = data.types[data.columns[1][0]];
  let chartPieMode = false;
  let pieTooltip = null;

  const [
    globalMinValue,
    globalMaxValue,
    globalColumnMinMaxValues,
    globalValuesCount,
  ] = countMinMaxValues();

  let curMinValue = null;
  let curMaxValue = null;

  let curColumnMinMaxValues = null;

  let chartWidth = null;
  let chartHeight = null;
  let timelineWidth = null;
  let timelineHeight = null;
  let timelineStart = null;
  let timelineEnd = null;
  let timelineMinValue = null;
  let timelineMaxValue = null;
  let timelineScaleStart = 0;
  let timelineScaleEnd = 1;

  let curValuesAnimation;
  let curTimelineAnimation;
  let curDatesAnimation;
  let curZoomAnimation;

  const curPieSelectionAnimations = {};

  let curDatesStep;
  let selectedPoint;
  let selectedPieColumn;

  let datesRangeString = '';

  let curPieState = null;

  if (data.zoom) {
    const zoomDate = data.zoom - TIMEZONE_OFFSET;
    const xColumn = data.columns[0];
    const startIndex = 1;
    const endIndex = xColumn.length - 1;
    const zoomStartDate = xColumn[startIndex];
    const zoomEndDate = xColumn[endIndex];
    if (zoomEndDate - zoomStartDate <= DAY) {
      timelineStart = 0;
      timelineEnd = 1;
      container.querySelector('.chart_timeline').hidden = true;
    } else {
      const midnightIndex = xColumn.indexOf(zoomDate) - 1;
      timelineStart = midnightIndex / (endIndex - startIndex);
      timelineEnd = (midnightIndex + 23) / (endIndex - startIndex);
    }

    header.innerHTML = '<a class="chart_header_zoom_out">Zoom Out</a>';
    header.addEventListener('click', () => {
      app.zoomOutChart(data.id);
    });
  } else {
    timelineStart = .8;
    timelineEnd = 1;

    header.innerText = data.title;
  }

  if (chartType === 'area') {
    container.querySelector('.chart_canvas_shadow').remove();
  }

  const slider = ChartSlider(container.querySelector('.chart_timeline_handle'), {
    initialStart: timelineStart,
    initialEnd: timelineEnd,
    onChange(start, end) {
      timelineStart = start;
      timelineEnd = end;
      const prevMin = curMinValue;
      const prevMax = curMaxValue;
      const prevColumnMinMax = curColumnMinMaxValues;
      updateCurMinMaxValues();
      animateValuesTransition(prevMin, prevMax, curMinValue, curMaxValue, prevColumnMinMax, curColumnMinMaxValues);
      updateDatesRangeText();
      if (selectedPoint) {
        removeSelectedPoint();
      }
      if (chartPieMode) {
        selectedPieColumn = null;
        updatePieTooltip();
      }
    }
  });

  const legend = ChartLegend(container.querySelector('.chart_legend'), {
    app,
    chartData: data,
    columnDisabled,
    onToggle(changedLabels) {
      const prevMin = curMinValue;
      const prevMax = curMaxValue;
      const prevTimelineMin = timelineMinValue;
      const prevTimelineMax = timelineMaxValue;
      const prevColumnMinMax = curColumnMinMaxValues;
      updateCurMinMaxValues();
      animateValuesTransition(prevMin, prevMax, curMinValue, curMaxValue, prevColumnMinMax, curColumnMinMaxValues, changedLabels);
      animateTimelineTransition(prevTimelineMin, prevTimelineMax, timelineMinValue, timelineMaxValue);
      if (selectedPoint) {
        showSelectedPointPopup();
      }
      if (chartPieMode) {
        selectedPieColumn = null;
        updatePieTooltip();
      }
    }
  });

  if (data.zoom) {
    curZoomAnimation = true;
    chartWidth = canvas.width = zoomParams.chartWidth;
    chartHeight = canvas.height = zoomParams.chartHeight;
    updateCurMinMaxValues();
    updateDatesRangeText();
    animateZoomInTransition();
  }
  requestAnimationFrame(checkResizeRedraw);

  window.addEventListener('load', checkResizeRedraw);
  window.addEventListener('resize', checkResizeRedraw);

  app.addEventListener('theme_switch', () => {
    redrawChart();
    redrawTimeline();
  });

  if ('ontouchstart' in window) {
    canvas.addEventListener('touchstart', checkSelectedPoint);
    canvas.addEventListener('touchmove', checkSelectedPoint);
    canvas.addEventListener('touchstart', () => {
      selectedPointPopup.style.pointerEvents = 'none';
    });
    canvas.addEventListener('touchend', () => {
      selectedPointPopup.style.pointerEvents = 'auto';
    });
    selectedPointPopup.addEventListener('click', zoomSelectedPoint);
  } else {
    canvas.addEventListener('mousemove', checkSelectedPoint);
    canvas.addEventListener('mouseleave', removeSelectedPoint);
    canvas.addEventListener('click', zoomSelectedPoint);
  }

  function checkSelectedPoint(event) {
    if (slider.isActive()) {
      return;
    }

    if (event.type === 'touchstart' && selectedPoint) {
      removeSelectedPoint();
      return;
    }

    const canvasRect = canvas.getBoundingClientRect();
    const eventX = (event.touches ? event.touches[0].pageX : event.pageX) - canvasRect.left - window.scrollX;
    const eventY = (event.touches ? event.touches[0].pageY : event.pageY) - canvasRect.top - window.scrollY;

    if (chartType === 'area' && chartPieMode) {
      const prevSelected = selectedPieColumn;
      const x = eventX * DPR;
      const y = eventY * DPR;
      selectedPieColumn = null;
      for (const label of Object.keys(curPieState)) {
        const { path } = curPieState[label];
        if (chartCtx.isPointInPath(path, x, y)) {
          selectedPieColumn = label;
          break;
        }
      }
      if (prevSelected !== selectedPieColumn) {
        prevSelected && animatePieSelection(prevSelected, false);
        selectedPieColumn && animatePieSelection(selectedPieColumn, true);
      }
      updatePieTooltip(event.pageX, event.pageY, selectedPieColumn);
      return;
    }

    const chartX = eventX * DPR - CHART_X_PADDING;
    if (chartX < 0 || chartX >= chartWidth - CHART_X_PADDING * 2) {
      removeSelectedPoint();
      return;
    }

    const availableWidth = (chartWidth - CHART_X_PADDING * 2);
    const virtualWidth = availableWidth / (timelineEnd - timelineStart);
    const virtualOffsetX = virtualWidth * timelineStart;

    let index;
    let pointerX;

    if (chartType === 'bar') {
      const virtualBarWidth = virtualWidth / globalValuesCount;
      index = Math.floor((virtualOffsetX + chartX) / virtualBarWidth);
      pointerX = Math.round((CHART_X_PADDING + index * virtualBarWidth + virtualBarWidth / 2 - virtualOffsetX) / DPR);
    } else {
      const virtualDeltaX = virtualWidth / (globalValuesCount - 1);
      index = Math.round((virtualOffsetX + chartX) / virtualDeltaX);
      pointerX = Math.round((CHART_X_PADDING + index * virtualDeltaX - virtualOffsetX) / DPR);
    }

    setSelectedPoint(index, pointerX)
  }

  function setSelectedPoint(index, pointerX) {
    selectedPoint = 1 + index;
    redrawChart();
    showSelectedPointPopup(pointerX);
    canvas.style.cursor = !data.zoom && !chartPieMode ? 'pointer' : '';
  }

  function removeSelectedPoint() {
    selectedPoint = null;
    selectedPieColumn = null;
    redrawChart();
    hideSelectedPointPopup();
    canvas.style.cursor = '';
  }

  function zoomSelectedPoint() {
    if (!selectedPoint || data.zoom) {
      return;
    }

    const pointerX = selectedPointPopup.dataset.pointerX;
    const chartX = pointerX * DPR;

    if (chartType === 'area') {
      zoomPieChart();
    } else {
      const ts = data.columns[0][selectedPoint] + TIMEZONE_OFFSET;
      if (chartType === 'line') {
        removeSelectedPoint();
      }
      const zoomParams = Object.assign({
        columnDisabled,
        chartWidth,
        chartHeight,
        chartX,
      }, getZoomImages());
      app.zoomChart({ id: data.id, zoom: ts }, zoomParams);
      removeSelectedPoint();
    }
  }

  function zoomPieChart() {
    removeSelectedPoint();
    header.innerHTML = '<a class="chart_header_zoom_out">Zoom Out</a>';
    header.addEventListener('click', () => {
      if (chartPieMode) {
        zoomOutPieChart();
      }
    });

    const ts = timelineStart;
    const te = timelineEnd;

    animate({
      drawFrame(progress) {
        if (progress < 0.5) {
          canvas.style.opacity = 1 - progress * 2;
        } else {
          if (!chartPieMode) {
            chartPieMode = true;
            redrawChart();
          }
          const t = (progress - 0.5) * 2;
          canvas.style.opacity = t;
          const angle = 90 - 90 * t;
          canvas.style.transform = `rotate(${angle}deg)`;
        }

        timelineScaleStart = getValueTransition(0, ts, progress);
        timelineScaleEnd = getValueTransition(1, te, progress);
        redrawTimeline();

        updateDatesRangeText();
      },
      duration: 400,
      onComplete() { },
      onAbort() { }
    });
  }

  function zoomOutPieChart() {
    updatePieTooltip();
    chartPieMode = false;
    timelineStart = timelineScaleStart;
    timelineEnd = timelineScaleEnd;
    timelineScaleStart = 0;
    timelineScaleEnd = 1;
    redrawChart();
    redrawTimeline();
    updateDatesRangeText();
    slider.update(timelineStart, timelineEnd);

    header.innerText = data.title;
  }

  function getZoomImages() {
    const gridCanvas = document.createElement('canvas');
    const columnsCanvas = document.createElement('canvas');

    gridCanvas.width = columnsCanvas.width = chartWidth;
    gridCanvas.height = columnsCanvas.height = chartHeight;

    {
      const ctx = gridCanvas.getContext('2d');
      chartCtxDraw(drawChartGrid, ctx);
      chartCtxDraw(drawChartAxisY, ctx);
      chartCtxDraw(drawChartAxisX, ctx);
    }

    {
      const ctx = columnsCanvas.getContext('2d');
      chartCtxDraw(drawChartColumns, ctx);
    }

    return { gridCanvas, columnsCanvas };
  }

  function animateZoomInTransition() {
    const { gridCanvas: outGridCanvas, columnsCanvas: outColumnsCanvas } = zoomParams;
    const { gridCanvas: inGridCanvas, columnsCanvas: inColumnsCanvas } = getZoomImages();

    const { chartX } = zoomParams;

    const k = chartX / chartWidth;

    const outThreshold = 0.7;
    const inThreshold = 0;

    curZoomAnimation = animate({
      drawFrame(progress) {
        chartCtx.clearRect(0, 0, chartWidth, chartHeight);
        if (progress < outThreshold) { // out
          const t = progress / outThreshold;
          chartCtx.globalAlpha = 1 - t;
          chartCtx.drawImage(outGridCanvas, 0, 0, chartWidth, chartHeight);
          const dw = chartWidth * (1 + 4 * t);
          const dx = chartWidth * k - dw * k;
          chartCtx.drawImage(outColumnsCanvas, dx, 0, dw, chartHeight);
        }
        if (progress > inThreshold) { // in
          const t = (progress - inThreshold) / (1 - inThreshold);
          chartCtx.globalAlpha = t;
          chartCtx.drawImage(inGridCanvas, 0, 0, chartWidth, chartHeight);
          const dw = chartWidth * t;
          const dx = chartWidth * k - dw * k;
          chartCtx.drawImage(inColumnsCanvas, 0, 0, chartWidth, chartHeight, dx, 0, dw, chartHeight);
        }
      },
      duration: 400,
      onComplete() {
        outGridCanvas.width = 0;
        outColumnsCanvas.width = 0;
        inGridCanvas.width = 0;
        inColumnsCanvas.width = 0;
        chartCtx.globalAlpha = 1;
        curZoomAnimation = null;
        redrawChart();
      }
    });
  }

  function showSelectedPointPopup(pointerX = null) {
    let ts = 0;
    let valuesSum = 0;
    const values = [];

    for (const column of data.columns) {
      const label = column[0];
      if (data.types[label] === 'x') {
        ts = column[selectedPoint];
      } else if (!isDisabledColumn(label)) {
        const value = column[selectedPoint];
        const name = data.names[label];
        const color = data.colors[label];
        valuesSum += value;
        values.push({ name, value, color });
      }
    }

    const date = new Date(ts + TIMEZONE_OFFSET);
    let dateString = WEEKDAYS_SHORT[date.getDay()] + ', ' + MONTHS_SHORT[date.getMonth()] + ' ' + date.getDate();
    if (data.zoom) {
      dateString += ', ' + formatAxisXTime(ts);
    }

    let popupContent = '';
    popupContent += `<div class="chart_point_popup_date">${dateString}</div>`;
    popupContent += `<div class="chart_point_popup_rows_wrap">`;
    for (const item of values) {
      const valueFormatted = formatSelectedPointValue(item.value);
      const percent = data.percentage ? Math.round(item.value / valuesSum * 100) + '%' : '';
      popupContent += `<div class="chart_point_popup_row"><div class="chart_point_popup_row_percent">${percent}</div><div class="chart_point_popup_row_name">${item.name}</div><div class="chart_point_popup_row_value" style="color:${item.color};">${valueFormatted}</div></div>`;
    }
    if (data.stacked && values.length > 1) {
      const sumFormatted = formatSelectedPointValue(valuesSum);
      popupContent += `<div class="chart_point_popup_row"><div class="chart_point_popup_row_percent"></div><div class="chart_point_popup_row_name">All</div><div class="chart_point_popup_row_value">${sumFormatted}</div></div>`;
    }
    popupContent += `</div>`;

    if (!data.zoom) {
      popupContent += '<div class="chart_point_popup_arrow"></div>';
    }

    selectedPointPopup.innerHTML = popupContent;
    selectedPointPopup.hidden = false;

    if (pointerX === null) {
      pointerX = selectedPointPopup.dataset.pointerX;
    } else {
      selectedPointPopup.dataset.pointerX = pointerX;
    }

    const popupOffset = 15;
    const width = selectedPointPopup.offsetWidth;
    let left = Math.round(pointerX - width - popupOffset);
    if (left < 5) {
      left = Math.min(pointerX + popupOffset, container.offsetWidth - width - 5);
    }
    selectedPointPopup.style.left = left + 'px';
  }

  function formatSelectedPointValue(value) {
    let result = '';
    do {
      let remainder = (value % 1e3);
      if (remainder < value && remainder < 100) {
        remainder = remainder.toString().padStart(3, '0');
      }
      result = remainder + ' ' + result;
      value = Math.floor(value / 1e3);
    } while (value);
    return result;
  }

  function hideSelectedPointPopup() {
    selectedPointPopup.hidden = true;
  }

  function checkResizeRedraw() {
    const chartRect = canvas.getBoundingClientRect();
    const timelineRect = timelineCanvas.getBoundingClientRect();

    const chartRectWidth = chartRect.width * DPR;
    const chartRectHeight = chartRect.height * DPR;
    const timelineRectWidth = timelineRect.width * DPR;
    const timelineRectHeight = timelineRect.height * DPR;

    if (chartWidth !== chartRectWidth) {
      chartWidth = canvas.width = chartRectWidth;
      chartHeight = canvas.height = chartRectHeight;
      updateCurMinMaxValues();
      updateDatesRangeText();
      if (chartWidth && chartHeight) {
        redrawChart();
      }
    }

    if (timelineWidth !== timelineRectWidth) {
      timelineWidth = timelineCanvas.width = timelineRectWidth;
      timelineHeight = timelineCanvas.height = timelineRectHeight;
      if (timelineWidth && timelineHeight) {
        redrawTimeline();
      }
    }
  }

  function updateCurMinMaxValues() {
    const startIndex = 1 + Math.max(0, Math.floor(globalValuesCount * timelineStart) - 1);
    const endIndex = 1 + Math.min(globalValuesCount, Math.ceil(globalValuesCount * timelineEnd) + 1);

    let [minValue, maxValue, columnMinMaxValues] = countMinMaxValues(startIndex, endIndex);

    if (minValue === null || maxValue === null) {
      return;
    }

    [timelineMinValue, timelineMaxValue] = countMinMaxValues();

    [curMinValue, curMaxValue] = getAxisYMinMax(minValue, maxValue);

    curColumnMinMaxValues = {};
    for (const label of Object.keys(columnMinMaxValues)) {
      let { min, max } = columnMinMaxValues[label];
      [min, max] = getAxisYMinMax(min, max);
      curColumnMinMaxValues[label] = { min, max };
    }
    Object.freeze(curColumnMinMaxValues);
  }

  function countMinMaxValues(startIndex = null, endIndex = null) {
    let minValue = null;
    let maxValue = null;
    let valuesCount = data.columns[0].length - 1;
    const columnMinMaxValues = {};

    if (startIndex === null) {
      startIndex = 1;
    }
    if (endIndex === null) {
      endIndex = 1 + valuesCount;
    }

    if (data.stacked) {
      minValue = 0;
      for (let i = startIndex; i <= endIndex && i <= valuesCount; i++) {
        let value = 0;
        for (const column of data.columns) {
          const label = column[0];
          if (data.types[label] === 'x' || isDisabledColumn(label)) {
            continue;
          }
          value += column[i];
        }
        if (maxValue === null || value > maxValue) {
          maxValue = value;
        }
      }
    } else {
      for (const column of data.columns) {
        const label = column[0];
        const type = data.types[label];
        if (type === 'x' || isDisabledColumn(label) && !data.y_scaled) {
          continue;
        }
        if (type === 'bar') {
          minValue = 0;
        }
        let columnMin = null;
        let columnMax = null;
        for (let i = startIndex; i <= endIndex && i <= valuesCount; i++) {
          const value = column[i];
          if (maxValue === null || value > maxValue) {
            maxValue = value;
          }
          if (minValue === null || value < minValue) {
            minValue = value;
          }
          if (data.y_scaled) {
            if (columnMin == null || value < columnMin) {
              columnMin = value;
            }
            if (columnMax == null || value > columnMax) {
              columnMax = value;
            }
          }
        }
        if (data.y_scaled) {
          columnMinMaxValues[label] = {
            min: columnMin,
            max: columnMax,
          };
        }
      }
    }

    return [minValue, maxValue, columnMinMaxValues, valuesCount];
  }

  function countValuesSum(startIndex = null, endIndex = null) {
    if (startIndex === null) {
      startIndex = 1;
    }
    if (endIndex === null) {
      endIndex = 1 + globalValuesCount;
    }
    const result = new Uint32Array(globalValuesCount + 1);
    if (data.stacked) {
      for (const column of data.columns) {
        const label = column[0];
        if (label === 'x' || isDisabledColumn(label) && !isColumnAnimating(label)) {
          continue;
        }
        for (let i = startIndex; i <= endIndex; i++) {
          result[i] += column[i] * getColumnAlpha(label);
        }
      }
    }
    return result;
  }

  function updateDatesRangeText() {
    const scaleRange = timelineScaleEnd - timelineScaleStart;
    const ts = timelineScaleStart + scaleRange * timelineStart;
    const te = timelineScaleStart + scaleRange * timelineEnd;

    const startIndex = 1 + Math.ceil((globalValuesCount - 1) * ts);
    const endIndex = 1 + Math.floor((globalValuesCount - 1) * te);

    const xColumn = data.columns[0];
    const startDate = new Date(xColumn[startIndex] + TIMEZONE_OFFSET);
    const endDate = new Date(xColumn[endIndex] + TIMEZONE_OFFSET);

    const startDateString = startDate.getDate() + ' ' + MONTHS[startDate.getMonth()] + ' ' + startDate.getFullYear();
    const endDateString = endDate.getDate() + ' ' + MONTHS[endDate.getMonth()] + ' ' + endDate.getFullYear();

    let result;
    if (startDateString === endDateString) {
      result = startDateString;
    } else {
      result = `${startDateString} - ${endDateString}`;
    }

    if (result !== datesRangeString) {
      datesRangeString = result;
      datesRangeContainer.innerText = datesRangeString;
    }
  }

  function animateValuesTransition(fromMin, fromMax, toMin, toMax, fromColumnMinMax, toColumnMinMax, labels) {
    if (curValuesAnimation) {
      if (data.y_scaled) {
        const same = Object.keys(toColumnMinMax).every((label) => {
          const newTo = toColumnMinMax[label];
          const curTo = curValuesAnimation.toColumnMinMax[label];
          return newTo.min === curTo.min && newTo.max === curTo.max;
        });
        if (same) {
          return;
        }
      } else if (toMin === curValuesAnimation.toMin && toMax === curValuesAnimation.toMax) {
        return;
      }
      curValuesAnimation.abort();
    }

    const { abort } = animate({
      drawFrame(progress) {
        curMinValue = fromMin + (toMin - fromMin) * progress;
        curMaxValue = fromMax + (toMax - fromMax) * progress;
        if (data.y_scaled) {
          curColumnMinMaxValues = {};
          for (const label of Object.keys(toColumnMinMax)) {
            const { min: fromMin, max: fromMax } = fromColumnMinMax[label];
            const { min: toMin, max: toMax } = toColumnMinMax[label];
            const curMin = fromMin + (toMin - fromMin) * progress;
            const curMax = fromMax + (toMax - fromMax) * progress;
            curColumnMinMaxValues[label] = { min: curMin, max: curMax };
          }
          Object.freeze(curColumnMinMaxValues);
        }
        if (labels) {
          for (const label of labels) {
            columnTransparency[label] = isDisabledColumn(label) ? progress : 1 - progress;
          }
        }
        curValuesAnimation.progress = progress;
        redrawChart();
      },
      duration: ANIMATION_VALUES_DURATION,
      onComplete() {
        curValuesAnimation = null;
        if (labels) {
          for (const label of labels) {
            columnTransparency[label] = null;
          }
        }
        curMinValue = toMin;
        curMaxValue = toMax;
        curColumnMinMaxValues = toColumnMinMax;
        redrawChart();
      },
      onAbort() {
        if (labels) {
          for (const label of labels) {
            columnTransparency[label] = null;
          }
        }
      }
    });

    const gridTransition = (fromMin !== toMin || fromMax !== toMax) && (fromMin || fromMax) && (toMin || toMax) && !data.percentage;

    curValuesAnimation = { fromMin, fromMax, toMin, toMax, fromColumnMinMax, toColumnMinMax, progress: 0, gridTransition, abort };
  }

  function animate({ drawFrame, duration, onComplete, onAbort }) {
    let animationId;
    let start = null;
    let aborted = false;

    function tick(now) {
      if (aborted) {
        return;
      }
      if (!start) {
        start = now;
      }
      const t = Math.min(now - start, duration);
      const progress = ease(t / duration);
      drawFrame(progress);
      if (progress < 1) {
        animationId = requestAnimationFrame(tick);
      } else {
        onComplete();
      }
    }

    animationId = requestAnimationFrame(tick);

    function ease(t) {
      return (--t) * t * t + 1; // out cubic
      // return t<.5 ? 2*t*t : -1+(4-2*t)*t; // in-out quad
    }

    function abort() {
      cancelAnimationFrame(animationId);
      aborted = true;
      onAbort();
    }

    return { abort };
  }

  function drawChartGrid(ctx) {
    const xOffset = CHART_X_PADDING;
    const yOffset = GRID_AXIS_X_HEIGHT;

    ctx.lineWidth = GRID_LINE_WIDTH;
    ctx.strokeStyle = getThemeColor(GRID_LINE_DAY_COLOR, GRID_LINE_NIGHT_COLOR);

    const intervalHeight = !data.percentage ? GRID_INTERVAL_HEIGHT : GRID_PERCENTAGE_INTERVAL_HEIGHT;
    const linesNum = !data.percentage ? GRID_LINES_NUM : GRID_PERCENTAGE_LINES_NUM;

    for (let i = 0; i < linesNum; i++) {
      const y = chartHeight - i * (intervalHeight + GRID_LINE_WIDTH) - yOffset;
      ctx.beginPath();
      ctx.moveTo(xOffset, y);
      ctx.lineTo(chartWidth - xOffset, y);
      ctx.stroke();
    }
  }

  function drawChartGridTransition(ctx) {
    const { fromMax, toMax, progress } = curValuesAnimation;

    const xOffset = CHART_X_PADDING;
    const yOffset = GRID_AXIS_X_HEIGHT;

    ctx.lineWidth = GRID_LINE_WIDTH;
    ctx.strokeStyle = getThemeColor(GRID_LINE_DAY_COLOR, GRID_LINE_NIGHT_COLOR);

    { // zero line
      const y = chartHeight - yOffset;
      ctx.beginPath();
      ctx.moveTo(xOffset, y);
      ctx.lineTo(chartWidth - xOffset, y);
      ctx.stroke();
    }

    { // out animation
      const scaleFactor = getValueTransition(1, fromMax / toMax, progress); // animate 1 -> (fromMax/toMax)
      const scaledHeight = GRID_INTERVAL_HEIGHT * scaleFactor;
      ctx.globalAlpha = 1 - progress;
      for (let i = 1; i < GRID_LINES_NUM; i++) {
        const y = Math.round(chartHeight - i * (scaledHeight + GRID_LINE_WIDTH)) - yOffset;
        ctx.beginPath();
        ctx.moveTo(xOffset, y);
        ctx.lineTo(chartWidth - xOffset, y);
        ctx.stroke();
      }
    }

    { // in animation
      const scaleFactor = getValueTransition(toMax / fromMax, 1, progress); // animate (toMax/fromMax) -> 1
      const scaledHeight = GRID_INTERVAL_HEIGHT * scaleFactor;
      ctx.globalAlpha = progress;
      for (let i = 1; i < GRID_LINES_NUM; i++) {
        const y = Math.round(chartHeight - i * (scaledHeight + GRID_LINE_WIDTH)) - yOffset;
        ctx.beginPath();
        ctx.moveTo(xOffset, y);
        ctx.lineTo(chartWidth - xOffset, y);
        ctx.stroke();
      }
    }
  }

  function drawChartColumns(ctx, minValue, maxValue, columnMinMax) {
    const xOffset = CHART_X_PADDING;
    const yOffset = GRID_AXIS_X_HEIGHT + CHART_COLUMN_LINE_WIDTH;

    const availableWidth = chartWidth - xOffset * 2;
    const virtualWidth = availableWidth / (timelineEnd - timelineStart);
    const virtualDeltaX = virtualWidth / (globalValuesCount - 1);
    const virtualBarWidth = virtualWidth / globalValuesCount;
    const virtualOffsetX = virtualWidth * timelineStart;
    const availableHeight = (GRID_INTERVALS_NUM * GRID_INTERVAL_HEIGHT + GRID_LINES_NUM * GRID_LINE_WIDTH);
    const yFactor = availableHeight / (maxValue - minValue);
    const skipFactor = availableHeight / (globalMaxValue - globalMinValue);
    const skipTolerance = 3 * DPR;

    const totalValuesSum = countValuesSum();
    const curValuesSum = new Uint32Array(globalValuesCount + 1);

    ctx.lineWidth = CHART_COLUMN_LINE_WIDTH;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    for (const column of data.columns) {
      const label = column[0];
      if (label === 'x' || isDisabledColumn(label) && !isColumnAnimating(label)) {
        continue;
      }

      const color = getColumnColor(label);

      if (data.types[label] === 'line') {
        let columnMin = minValue;
        let columnMax = maxValue;
        let columnYFactor = yFactor;
        let columnSkipFactor = skipFactor;
        if (data.y_scaled) {
          columnMin = columnMinMax[label].min;
          columnMax = columnMinMax[label].max;
          columnYFactor = availableHeight / (columnMax - columnMin);
          columnSkipFactor = availableHeight / (globalColumnMinMaxValues[label].max - globalColumnMinMaxValues[label].min);
        }

        ctx.strokeStyle = color;
        ctx.globalAlpha = getColumnAlpha(label);
        ctx.beginPath();
        let lastVal = column[1];
        for (let i = 1; i <= globalValuesCount; i++) {
          const virtualPointX = (i - 1) * virtualDeltaX;
          if (virtualPointX < virtualOffsetX - xOffset) {
            if (virtualPointX >= virtualOffsetX - xOffset - virtualDeltaX) {
              const x = xOffset + virtualPointX - virtualOffsetX;
              const y = transformYPoint(column[i], columnMin, columnYFactor, chartHeight, yOffset);
              ctx.moveTo(x, y);
              lastVal = column[i];
            }
            continue;
          }
          if (virtualDeltaX < skipTolerance) {
            const t = Math.abs(column[i] - lastVal) * columnSkipFactor + virtualDeltaX;
            if (i > 1 && i < globalValuesCount && t < skipTolerance) {
              if (Math.abs(column[i] - column[i + 1]) * columnSkipFactor + virtualDeltaX <= t) {
                continue;
              }
            }
          }
          lastVal = column[i];
          const x = xOffset + virtualPointX - virtualOffsetX;
          const y = transformYPoint(column[i], columnMin, columnYFactor, chartHeight, yOffset);
          ctx.lineTo(x, y);
          if (virtualPointX > virtualOffsetX + chartWidth) {
            break;
          }
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (data.types[label] === 'bar') {
        const barWidthRounded = Math.ceil(virtualBarWidth);
        const barOffsetY = GRID_AXIS_X_HEIGHT;

        let barColor = color;
        if (selectedPoint) {
          barColor = getBarDarkenColor(barColor);
        }
        ctx.fillStyle = barColor;

        for (let i = 1; i <= globalValuesCount; i++) {
          const virtualPointX = (i - 1) * virtualBarWidth;
          if (virtualPointX + virtualBarWidth < virtualOffsetX - xOffset) {
            continue;
          }
          if (selectedPoint) {
            if (i === selectedPoint) {
              ctx.fillStyle = data.colors[label];
            } else if (i === selectedPoint + 1) {
              ctx.fillStyle = barColor;
            }
          }
          const prevValue = curValuesSum[i];
          const value = column[i] * getColumnAlpha(label);
          curValuesSum[i] += value;
          const x = Math.round(xOffset + virtualPointX - virtualOffsetX);
          const y = Math.round(transformYPoint(curValuesSum[i], minValue, yFactor, chartHeight, barOffsetY));
          const y2 = Math.round(transformYPoint(prevValue, minValue, yFactor, chartHeight, barOffsetY));
          ctx.fillRect(x, y, barWidthRounded, y2 - y);
          if (virtualPointX > virtualOffsetX + chartWidth) {
            break;
          }
        }
      } else if (data.types[label] === 'area') {
        const areaAvailHeight = GRID_PERCENTAGE_INTERVAL_HEIGHT * GRID_PERCENTAGE_INTERVALS_NUM + GRID_LINE_WIDTH * (GRID_PERCENTAGE_LINES_NUM - 1);
        const areaOffsetY = chartHeight - areaAvailHeight - GRID_AXIS_X_HEIGHT;
        let startX = null;
        let endX = null;
        ctx.fillStyle = color;
        ctx.beginPath();
        for (let i = 1; i <= globalValuesCount; i++) {
          const virtualPointX = (i - 1) * virtualDeltaX;
          if (virtualPointX + virtualDeltaX < virtualOffsetX - xOffset) {
            continue;
          }
          const percentOffset = 1 - curValuesSum[i] / totalValuesSum[i];
          curValuesSum[i] += column[i] * getColumnAlpha(label);
          const x = Math.floor(xOffset + virtualPointX - virtualOffsetX);
          const y = areaOffsetY + areaAvailHeight * percentOffset;
          ctx.lineTo(x, y);
          if (startX === null) {
            startX = x;
          }
          endX = x;
          if (virtualPointX > virtualOffsetX + chartWidth) {
            break;
          }
        }
        ctx.lineTo(endX, areaOffsetY);
        ctx.lineTo(startX, areaOffsetY);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function drawChartSelectedPoint(ctx, minValue, maxValue) {
    const xOffset = CHART_X_PADDING;
    const yOffset = GRID_AXIS_X_HEIGHT + CHART_COLUMN_LINE_WIDTH;

    const availableWidth = chartWidth - xOffset * 2;
    const virtualWidth = availableWidth / (timelineEnd - timelineStart);
    const virtualDeltaX = virtualWidth / (globalValuesCount - 1);
    const virtualOffsetX = virtualWidth * timelineStart;

    const availableHeight = (GRID_INTERVALS_NUM * GRID_INTERVAL_HEIGHT + GRID_LINES_NUM * GRID_LINE_WIDTH);

    const virtualPointX = (selectedPoint - 1) * virtualDeltaX;
    const x = Math.round(xOffset + virtualPointX - virtualOffsetX);

    ctx.lineWidth = GRID_LINE_WIDTH;
    ctx.strokeStyle = getThemeColor(GRID_LINE_DAY_COLOR, GRID_LINE_NIGHT_COLOR);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, chartHeight - GRID_AXIS_X_HEIGHT);
    ctx.stroke();

    ctx.lineWidth = CHART_COLUMN_LINE_WIDTH;
    ctx.fillStyle = getThemeColor(CHART_SELECTED_POINT_DAY_FILL, CHART_SELECTED_POINT_NIGHT_FILL);

    for (const column of data.columns) {
      const label = column[0];
      if (data.types[label] === 'line' && !isDisabledColumn(label)) {
        if (data.y_scaled) {
          const { min, max } = curColumnMinMaxValues[label];
          minValue = min;
          maxValue = max;
        }
        const yFactor = availableHeight / (maxValue - minValue);
        const y = transformYPoint(column[selectedPoint], minValue, yFactor, chartHeight, yOffset);
        ctx.strokeStyle = getColumnColor(label);
        ctx.beginPath();
        ctx.arc(x, y, CHART_SELECTED_POINT_RADIUS, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  function drawChartAxisYTransition(ctx) {
    const { fromMin, fromMax, toMin, toMax, fromColumnMinMax, toColumnMinMax, progress } = curValuesAnimation;

    const xOffset = CHART_X_PADDING;
    const yOffset = GRID_AXIS_X_HEIGHT;
    const labelBottomPadding = GRID_AXIS_Y_LABEL_BOTTOM_PADDING;
    const defaultColor = getThemeColor(GRID_AXIS_TEXT_COLOR, GRID_AXIS_TEXT_NIGHT_COLOR);

    ctx.fillStyle = defaultColor;
    ctx.font = GRID_AXIS_LABEL_FONT;
    ctx.textBaseline = 'bottom';

    { // out animation
      const scaleFactor = getValueTransition(1, fromMax / toMax, progress); // animate 1 -> (fromMax/toMax)
      const scaledHeight = GRID_INTERVAL_HEIGHT * scaleFactor;
      const alpha = 1 - progress;
      if (data.y_scaled) {
        for (let i = 1; i <= 2; i++) {
          const label = data.columns[i][0];
          const color = data.colors[label];
          const align = i > 1 ? 'right' : 'left';
          const { min: fromMin, max: fromMax } = fromColumnMinMax[label];
          const valueStep = (fromMax - fromMin) / GRID_INTERVALS_NUM;
          const curMaxValue = curColumnMinMaxValues[label].max;
          drawAxisValues(fromMin, curMaxValue, valueStep, scaledHeight, alpha, color, align);
        }
      } else {
        const valueStep = (fromMax - fromMin) / GRID_INTERVALS_NUM;
        drawAxisValues(fromMin, curMaxValue, valueStep, scaledHeight, alpha);
      }
    }

    { // in animation
      const scaleFactor = getValueTransition(toMax / fromMax, 1, progress); // animate (toMax/fromMax) -> 1
      const scaledHeight = GRID_INTERVAL_HEIGHT * scaleFactor;
      const alpha = progress;
      if (data.y_scaled) {
        for (let i = 1; i <= 2; i++) {
          const label = data.columns[i][0];
          const color = data.colors[label];
          const align = i > 1 ? 'right' : 'left';
          const { min: toMin, max: toMax } = toColumnMinMax[label];
          const valueStep = (toMax - toMin) / GRID_INTERVALS_NUM;
          const curMaxValue = curColumnMinMaxValues[label].max;
          drawAxisValues(toMin, curMaxValue, valueStep, scaledHeight, alpha, color, align);
        }
      } else {
        const valueStep = (toMax - toMin) / GRID_INTERVALS_NUM;
        drawAxisValues(toMin, curMaxValue, valueStep, scaledHeight, progress);
      }
    }

    function drawAxisValues(min, max, step, height, alpha, color = defaultColor, align = 'left') {
      ctx.globalAlpha = alpha;
      ctx.textAlign = align;
      ctx.fillStyle = color;
      for (let i = 0; i < GRID_LINES_NUM; i++) {
        const text = formatAxisYValue(min + Math.round(step * i), max);
        const x = align === 'left' ? xOffset : chartWidth - xOffset;
        const y = Math.round(chartHeight - i * (height + GRID_LINE_WIDTH)) - labelBottomPadding - yOffset;
        ctx.fillText(text, x, y);
      }
    }
  }

  function drawChartAxisY(ctx, minValue, maxValue) {
    if (minValue === maxValue) {
      return;
    }

    const intervalsNum = !data.percentage ? GRID_INTERVALS_NUM : GRID_PERCENTAGE_INTERVALS_NUM;
    const intervalHeight = !data.percentage ? GRID_INTERVAL_HEIGHT : GRID_PERCENTAGE_INTERVAL_HEIGHT;
    const labelBottomPadding = GRID_AXIS_Y_LABEL_BOTTOM_PADDING;
    const lineWidth = GRID_LINE_WIDTH;
    const linesNum = !data.percentage ? GRID_LINES_NUM : GRID_PERCENTAGE_LINES_NUM;

    ctx.font = GRID_AXIS_LABEL_FONT;
    ctx.textBaseline = 'bottom';
    const xOffset = CHART_X_PADDING;
    const yOffset = GRID_AXIS_X_HEIGHT;

    if (data.y_scaled) {
      for (let i = 1; i <= 2; i++) {
        const label = data.columns[i][0];
        const { min: minValue, max: maxValue } = curColumnMinMaxValues[label];
        const valueStep = (maxValue - minValue) / intervalsNum;

        ctx.fillStyle = data.colors[label];
        ctx.textAlign = i > 1 ? 'right' : 'left';
        const x = i > 1 ? chartWidth - xOffset : xOffset;

        for (let i = 0; i < linesNum; i++) {
          const y = Math.round(chartHeight - i * (intervalHeight + lineWidth)) - labelBottomPadding - yOffset;
          let text;
          if (data.percentage) {
            text = i / intervalsNum * 100;
          } else {
            text = formatAxisYValue(minValue + Math.round(valueStep * i), maxValue);
          }
          ctx.fillText(text, x, y);
        }
      }
    } else {
      const valueStep = (maxValue - minValue) / intervalsNum;
      ctx.fillStyle = getThemeColor(GRID_AXIS_TEXT_COLOR, GRID_AXIS_TEXT_NIGHT_COLOR);
      for (let i = 0; i < linesNum; i++) {
        const y = Math.round(chartHeight - i * (intervalHeight + lineWidth)) - labelBottomPadding - yOffset;
        let text;
        if (data.percentage) {
          text = i / intervalsNum * 100;
        } else {
          text = formatAxisYValue(minValue + Math.round(valueStep * i), maxValue);
        }
        ctx.fillText(text, xOffset, y);
      }
    }
  }

  function drawChartAxisX(ctx) {
    const xOffset = CHART_X_PADDING;
    const yOffset = GRID_AXIS_X_HEIGHT - GRID_AXIS_X_LABEL_TOP_PADDING;

    const availableWidth = chartWidth - xOffset * 2;
    const virtualWidth = availableWidth / (timelineEnd - timelineStart);
    const virtualOffsetX = virtualWidth * timelineStart;

    let step = 1;
    let labelsFactor = 0;
    while (1) {
      labelsFactor = globalValuesCount / step;
      if (virtualWidth / labelsFactor >= GRID_AXIS_X_LABEL_WIDTH) {
        break;
      }
      step *= 2;
    }

    if (curDatesStep && curDatesStep !== step) {
      animateDatesTransition(curDatesStep, step);
    }
    curDatesStep = step;

    const widths = {};
    const labelsCount = Math.floor(labelsFactor);

    if (step > 1) {
      widths[step] = GRID_AXIS_X_LABEL_WIDTH;
      widths[step / 2] = (virtualWidth - (labelsCount * widths[step])) / labelsCount;
    } else {
      widths[step] = virtualWidth / labelsCount;
    }

    ctx.fillStyle = getThemeColor(GRID_AXIS_TEXT_COLOR, GRID_AXIS_TEXT_NIGHT_COLOR);
    ctx.font = GRID_AXIS_LABEL_FONT;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';

    const idxOffset = globalValuesCount % step - 1;

    const y = chartHeight - yOffset;

    for (const column of data.columns) {
      if (column[0] !== 'x') {
        continue;
      }
      let curOffsetX = xOffset - virtualOffsetX;
      for (let i = 0; i < globalValuesCount; i++) {
        const j = i - idxOffset;
        if (j <= 0) {
          continue;
        }
        const stepRemainder = j % step;
        const labelWidth = !stepRemainder ? widths[step] : widths[stepRemainder];
        if (!labelWidth) {
          continue;
        }
        const labelX = curOffsetX;
        curOffsetX += labelWidth;
        if (labelX < -labelWidth || labelX > chartWidth) {
          continue;
        }
        if (curDatesAnimation && (globalValuesCount - 1 - i) % curDatesAnimation.step * 2 === curDatesAnimation.step) {
          ctx.globalAlpha = curDatesAnimation.progress;
        } else if (stepRemainder) {
          continue;
        } else {
          ctx.globalAlpha = 1;
        }
        const ts = column[1 + i];
        const text = data.zoom ? formatAxisXTime(ts) : formatAxisXDate(ts);
        const textX = Math.round(labelX + labelWidth / 2);
        ctx.fillText(text, textX, y);
      }
      break;
    }
  }

  function drawChartPie(ctx) {
    const startIndex = 1 + Math.max(0, Math.floor(globalValuesCount * timelineStart));
    const endIndex = 1 + Math.min(globalValuesCount - 1, Math.ceil(globalValuesCount * timelineEnd));

    const columnValuesSum = {};
    let totalSum = 0;

    for (const column of data.columns) {
      const label = column[0];
      if (data.types[label] !== 'area' || isDisabledColumn(label) && !isColumnAnimating(label)) {
        continue;
      }
      let columnSum = 0;
      for (let i = startIndex; i <= endIndex; i++) {
        columnSum += column[i];
      }
      columnSum *= getColumnAlpha(label);
      columnValuesSum[label] = columnSum;
      totalSum += columnSum;
    }

    const PI2 = Math.PI * 2;
    const radius = (chartHeight / 2) - 20 * DPR;
    const centerX = chartWidth / 2;
    const centerY = chartHeight / 2;

    let curAngle = 0;

    curPieState = {};

    for (const column of data.columns) {
      const label = column[0];
      if (data.types[label] !== 'area' || isDisabledColumn(label) && !isColumnAnimating(label)) {
        continue;
      }
      const partRatio = columnValuesSum[label] / totalSum;
      const startAngle = curAngle;
      const endAngle = startAngle + partRatio * PI2;

      const isSelectedLabel = selectedPieColumn === label;
      const selectedAnimationProgress = curPieSelectionAnimations[label] ? curPieSelectionAnimations[label].progress : isSelectedLabel ? 1 : 0;

      const path = new Path2D();
      path.arc(centerX, centerY, radius, startAngle, endAngle);
      path.lineTo(centerX, centerY);
      path.closePath();
      const color = getColumnColor(label);
      ctx.fillStyle = selectedAnimationProgress ? 'transparent' : color;
      ctx.fill(path);

      curPieState[label] = { path, value: columnValuesSum[label] };
      curAngle = endAngle;

      if (selectedAnimationProgress) {
        let centerOffset = CHART_SELECTED_PIE_PART_OFFSET * selectedAnimationProgress;
        const offsetAngle = startAngle + (endAngle - startAngle) / 2;
        const offsetX = Math.cos(offsetAngle) * centerOffset;
        const offsetY = Math.sin(offsetAngle) * centerOffset;
        const path = new Path2D();
        path.arc(centerX + offsetX, centerY + offsetY, radius, startAngle, endAngle);
        path.lineTo(centerX + offsetX, centerY + offsetY);
        path.closePath();
        ctx.fillStyle = color;
        ctx.fill(path);
      }

      if (partRatio > 0.01) {
        let fontSize;
        let radiusRatio;
        if (partRatio >= 0.15) {
          fontSize = 27 * DPR;
          radiusRatio = 0.6;
        } else if (partRatio >= 0.07) {
          fontSize = 18 * DPR;
          radiusRatio = 0.77;
        } else {
          fontSize = 10 * DPR;
          radiusRatio = 0.8;
        }
        const offsetAngle = startAngle + (endAngle - startAngle) / 2;
        const text = Math.round(partRatio * 100) + '%';
        const centerOffset = radius * radiusRatio + (CHART_SELECTED_PIE_PART_OFFSET * selectedAnimationProgress);
        const x = centerX + Math.cos(offsetAngle) * centerOffset;
        const y = centerY + Math.sin(offsetAngle) * centerOffset;
        ctx.font = `600 ${fontSize}px/${fontSize}px ${FONT_FAMILY}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.globalAlpha = getColumnAlpha(label);
        ctx.fillText(text, x, y);
        ctx.globalAlpha = 1;
      }
    }
  }

  function updatePieTooltip(pageX, pageY, label) {
    if (!pieTooltip) {
      pieTooltip = document.createElement('div');
      pieTooltip.classList.add('chart_pie_tooltip');
      container.append(pieTooltip);
    }

    if (!label) {
      pieTooltip.hidden = true;
      return;
    }

    const name = data.names[label];
    const color = data.colors[label];
    const value = formatSelectedPointValue(curPieState[label].value);

    pieTooltip.innerHTML = `<span class="chart_pie_tooltip_name">${name}</span><span class="chart_pie_tooltip_value" style="color:${color};">${value}</span>`;

    const containerRect = container.getBoundingClientRect();

    const width = pieTooltip.offsetWidth;

    let x = pageX - containerRect.left;
    let y = pageY - containerRect.top - window.scrollY;

    if (x + width > containerRect.width) {
      pieTooltip.style.left = '';
      pieTooltip.style.right = (containerRect.width - x + 10) + 'px';
    } else {
      pieTooltip.style.left = (x - 10) + 'px';
      pieTooltip.style.right = '';
    }
    pieTooltip.style.top = (y + 10) + 'px';

    pieTooltip.hidden = false;
  }

  function animatePieSelection(label, isSelected) {
    if (curPieSelectionAnimations[label]) {
      curPieSelectionAnimations[label].abort();
      curPieSelectionAnimations[label] = null;
    }

    const { abort } = animate({
      drawFrame(progress) {
        curPieSelectionAnimations[label].progress = isSelected ? progress : 1 - progress;
        redrawChart();
      },
      duration: 250,
      onComplete() {
        curPieSelectionAnimations[label] = null;
      },
      onAbort() {
        curPieSelectionAnimations[label] = null;
      }
    });

    curPieSelectionAnimations[label] = { abort, progress: 0 };
  }

  function animateDatesTransition(prevStep, newStep) {
    const step = Math.max(prevStep, newStep);
    if (curDatesAnimation) {
      curDatesAnimation.abort();
    }

    const { abort } = animate({
      drawFrame(progress) {
        if (!curDatesAnimation) {
          return;
        }
        curDatesAnimation.progress = newStep > prevStep ? 1 - progress : progress;
        chartCtx.clearRect(0, chartHeight - GRID_AXIS_X_HEIGHT + GRID_LINE_WIDTH, chartWidth, GRID_AXIS_X_HEIGHT);
        chartCtxDraw(drawChartAxisX);
      },
      duration: ANIMATION_VALUES_DURATION,
      onComplete() {
        curDatesAnimation = null;
      },
      onAbort() {
        curDatesAnimation = null;
      }
    });

    curDatesAnimation = { step, progress: (newStep > prevStep ? 1 : 0), abort };
  }

  function redrawChart() {
    if (!chartWidth || !chartHeight || curZoomAnimation) {
      return;
    }

    chartCtx.clearRect(0, 0, chartWidth, chartHeight);

    if (chartType === 'area' && chartPieMode) {
      chartCtxDraw(drawChartPie);
      return;
    }

    chartCtxDraw(drawChartColumns);

    if (curValuesAnimation && curValuesAnimation.gridTransition) {
      chartCtxDraw(drawChartGridTransition);
      chartCtxDraw(drawChartAxisYTransition);
    } else {
      chartCtxDraw(drawChartGrid);
      chartCtxDraw(drawChartAxisY);
    }

    chartCtxDraw(drawChartAxisX);

    if (selectedPoint && chartType !== 'bar') {
      chartCtxDraw(drawChartSelectedPoint);
    }
  }

  function redrawTimeline() {
    if (!timelineWidth || !timelineHeight) {
      return;
    }

    const ctx = timelineCtx;

    ctx.clearRect(0, 0, timelineWidth, timelineHeight);

    ctx.save();
    ctx.lineWidth = TIMELINE_COLUMN_LINE_WIDTH;

    const scaleRange = timelineScaleEnd - timelineScaleStart;

    const xOffset = TIMELINE_X_PADDING - timelineWidth * timelineScaleStart / scaleRange;
    const yOffset = (TIMELINE_Y_PADDING + TIMELINE_COLUMN_LINE_WIDTH);
    const xFactor = timelineWidth / (globalValuesCount - 1) / scaleRange;
    const yFactor = timelineHeight / (timelineMaxValue - timelineMinValue);
    const skipFactor = timelineHeight / (globalMaxValue - globalMinValue);
    const skipTolerance = 1.5 * DPR;

    const totalValuesSum = countValuesSum();
    const curValuesSum = new Uint32Array(globalValuesCount + 1);

    for (const column of data.columns) {
      const label = column[0];
      if (isDisabledColumn(label) && !isColumnAnimating(label)) {
        continue;
      }
      if (data.types[label] === 'line') {
        let columnMinValue = timelineMinValue;
        let columnMaxValue = timelineMaxValue;
        let columnYFactor = yFactor;
        let columnSkipFactor = skipFactor;
        if (data.y_scaled) {
          columnMinValue = globalColumnMinMaxValues[label].min;
          columnMaxValue = globalColumnMinMaxValues[label].max;
          columnYFactor = (timelineHeight - yOffset * 2) / (columnMaxValue - columnMinValue);
          columnSkipFactor = timelineHeight / (columnMaxValue - columnMinValue);
        }
        ctx.globalAlpha = getColumnAlpha(label);
        ctx.strokeStyle = data.colors[label];
        ctx.beginPath();
        ctx.moveTo(0, transformYPoint(column[1], columnMinValue, columnYFactor, timelineHeight, yOffset));
        let lastVal = column[1];
        for (let i = 2; i <= globalValuesCount; i++) {
          const t = Math.abs(column[i] - lastVal) * columnSkipFactor + xFactor;
          if (i > 1 && i < globalValuesCount && t < skipTolerance) {
            continue;
          }
          lastVal = column[i];
          const x = xOffset + transformXPoint(i - 1, xFactor);
          const y = transformYPoint(column[i], columnMinValue, columnYFactor, timelineHeight, yOffset);
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else if (data.types[label] === 'bar') {
        const yOffset = 0;
        const yFactor = timelineHeight / (timelineMaxValue - timelineMinValue);
        const barWidth = timelineWidth / globalValuesCount;
        const barWidthRounded = Math.ceil(barWidth);

        ctx.fillStyle = data.colors[label];

        for (let i = 1; i <= globalValuesCount; i++) {
          const prevValue = curValuesSum[i];
          const value = column[i] * getColumnAlpha(label);
          curValuesSum[i] += value;
          const x = xOffset + Math.round((i - 1) * barWidth);
          const y = Math.round(transformYPoint(curValuesSum[i], timelineMinValue, yFactor, timelineHeight, yOffset));
          const y2 = Math.round(transformYPoint(prevValue, timelineMinValue, yFactor, timelineHeight, yOffset));
          ctx.fillRect(x, y, barWidthRounded, y2 - y);
        }
      } else if (data.types[label] === 'area') {
        ctx.fillStyle = data.colors[label];
        ctx.beginPath();
        for (let i = 1; i <= globalValuesCount; i++) {
          const percentOffset = curValuesSum[i] / totalValuesSum[i];
          curValuesSum[i] += column[i] * getColumnAlpha(label);
          const x = xOffset + (i - 1) * xFactor;
          const y = timelineHeight - timelineHeight * percentOffset;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(timelineWidth, 0);
        ctx.lineTo(0, 0);
        ctx.closePath();
        ctx.fill();
      }
    }

    ctx.restore();
  }

  function chartCtxDraw(draw, ctx = chartCtx) {
    ctx.save();
    draw(ctx, curMinValue, curMaxValue, curColumnMinMaxValues);
    ctx.restore();
  }

  function animateTimelineTransition(fromMin, fromMax, toMin, toMax) {
    if (curTimelineAnimation) {
      curTimelineAnimation.abort();
    }

    const { abort } = animate({
      drawFrame(progress) {
        timelineMinValue = getValueTransition(fromMin, toMin, progress);
        timelineMaxValue = getValueTransition(fromMax, toMax, progress);
        redrawTimeline();
      },
      duration: ANIMATION_VALUES_DURATION,
      onComplete() {
        curTimelineAnimation = null;
        timelineMinValue = toMin;
        timelineMaxValue = toMax;
      },
      onAbort() {
        curTimelineAnimation = null;
      }
    });

    curTimelineAnimation = { fromMin, fromMax, toMin, toMax, abort };
  }

  function transformXPoint(index, xFactor) {
    return index * xFactor;
  }

  function transformYPoint(value, valueOffset, yFactor, canvasHeight, yOffset) {
    return canvasHeight - yOffset - (value - valueOffset) * yFactor;
  }

  function isDisabledColumn(label) {
    return !!columnDisabled[label];
  }

  function isColumnAnimating(label) {
    return columnTransparency[label] != null;
  }

  function getColumnAlpha(label) {
    return 1 - (columnTransparency[label] || 0);
  }

  function getValueTransition(from, to, progress) {
    return from + (to - from) * progress;
  }

  function formatAxisXDate(ts) {
    const date = new Date(ts + TIMEZONE_OFFSET);
    return MONTHS_SHORT[date.getMonth()] + ' ' + date.getDate();
  }

  function formatAxisXTime(ts) {
    const date = new Date(ts + TIMEZONE_OFFSET);
    const hoursStr = date.getHours().toString().padStart(2, '0');
    const minutesStr = date.getMinutes().toString().padStart(2, '0');
    return `${hoursStr}:${minutesStr}`;
  }

  function formatAxisYValue(value, maxValue) {
    if (value < 1e3 || value < 10e3 && maxValue < 10e3) {
      return Math.floor(value);
    } else if (value < 1e6) {
      return (value % 1e3 ? (value / 1e3).toFixed(1) : value / 1e3) + 'k';
    } else {
      return (value % 1e6 ? (value / 1e6).toFixed(1) : value / 1e6) + 'M';
    }
  }

  function getAxisYMinMax(minValue, maxValue) {
    const diff = maxValue - minValue;

    if (!diff) {
      return [minValue, maxValue];
    }

    const diffOrder = Math.pow(10, Math.floor(Math.log10(diff)));

    let resultMinValue = minValue - minValue % diffOrder;
    let resultMaxValue = maxValue + diffOrder - (maxValue % diffOrder);

    if (diffOrder > 10) {
      if (resultMaxValue - diffOrder * 0.4 > maxValue) {
        resultMaxValue -= diffOrder / 2;
      }
    }

    return [resultMinValue, resultMaxValue];
  }

  function getThemeColor(day, night) {
    return app.state.night ? night : day;
  }

  function getColumnColor(label) {
    const color = data.colors[label];
    return app.state.night ? getColumnNightColor(color, .85) : color;
  }

  function getBarDarkenColor(barColor) {
    const overlayColor = getThemeColor(CHART_COLUMN_BAR_OVERLAY_DAY_MASK, CHART_COLUMN_BAR_OVERLAY_NIGHT_MASK);
    return blendHexColors(barColor, overlayColor, CHART_COLUMN_BAR_OVERLAY_MASK_ALPHA);
  }

  return {
    get el() {
      return container;
    },
    get id() {
      return data.id;
    },
    redraw() {
      checkResizeRedraw();
      redrawChart();
      if (legend) {
        legend.update();
      }
    },
    destroy() {
    }
  };
}


function ChartSlider(handle, { initialStart, initialEnd, onChange }) {
  const MIN_RANGE = 0.05;
  const RESIZE_PADDING = 10;
  const MODE_DRAG = 1;
  const MODE_RESIZE_LEFT = 2;
  const MODE_RESIZE_RIGHT = 3;

  let start = Math.max(0, initialStart);
  let end = Math.min(1, initialEnd);

  let lastX;
  let dragMode;

  updatePos();

  handle.addEventListener('mousedown', dragStart);
  handle.addEventListener('touchstart', dragStart, { passive: false });
  handle.addEventListener('mousemove', handleHover);
  handle.parentNode.addEventListener('mousedown', containerTouch);
  handle.parentNode.addEventListener('touchstart', containerTouch, { passive: false });

  function containerTouch(event) {
    const containerRect = handle.parentNode.getBoundingClientRect();
    const pos = (getEventPageX(event) - containerRect.left) / containerRect.width;
    const range = end - start;

    start = pos - range / 2;
    end = pos + range / 2;

    if (start < 0) {
      start = 0;
      end = range;
    } else if (end > 1) {
      end = 1;
      start = 1 - range;
    }

    updatePos();
    onChange(start, end);

    dragStart(event);
    handle.style.cursor = '';
  }

  function dragStart(event) {
    event.preventDefault();
    event.stopPropagation();
    lastX = getEventPageX(event);

    dragMode = getDragMode(lastX);

    window.addEventListener('mousemove', dragMove);
    window.addEventListener('touchmove', dragMove);
    window.addEventListener('mouseup', dragEnd);
    window.addEventListener('touchend', dragEnd);
    document.addEventListener('selectstart', selectStart);
  }

  function dragMove(event) {
    const containerRect = handle.parentNode.getBoundingClientRect();
    const dX = (getEventPageX(event) - lastX);
    let delta = dX / containerRect.width;

    const prevStart = start;
    const prevEnd = end;

    if (dragMode === MODE_DRAG) {
      if (start + delta <= 0) {
        delta = 0 - start;
      } else if (end + delta >= 1) {
        delta = 1 - end;
      }
      start += delta;
      end += delta;
    } else if (dragMode === MODE_RESIZE_LEFT) {
      if (start + delta > end - MIN_RANGE) {
        start = end - MIN_RANGE;
      } else {
        start = Math.max(0, start + delta);
      }
    } else if (dragMode === MODE_RESIZE_RIGHT) {
      if (end + delta < start + MIN_RANGE) {
        end = start + MIN_RANGE;
      } else {
        end = Math.min(1, end + delta);
      }
    }

    lastX = getEventPageX(event);

    if (prevStart !== start || prevEnd !== end) {
      updatePos();
      onChange(start, end);
    }
  }

  function dragEnd() {
    lastX = null;
    dragMode = null;
    window.removeEventListener('mousemove', dragMove);
    window.removeEventListener('touchmove', dragMove);
    window.removeEventListener('mouseup', dragEnd);
    window.removeEventListener('touchend', dragEnd);
    document.removeEventListener('selectstart', selectStart);
  }

  function handleHover(event) {
    if (dragMode) {
      return;
    }
    switch (getDragMode(getEventPageX(event))) {
      case MODE_RESIZE_LEFT:
        handle.style.cursor = 'w-resize';
        break;
      case MODE_RESIZE_RIGHT:
        handle.style.cursor = 'e-resize';
        break;
      default:
        handle.style.cursor = '';
    }
  }

  function getDragMode(pointerX) {
    const handleRect = handle.getBoundingClientRect();
    if (pointerX <= handleRect.left + RESIZE_PADDING) {
      return MODE_RESIZE_LEFT;
    } else if (pointerX >= handleRect.right - RESIZE_PADDING) {
      return MODE_RESIZE_RIGHT;
    }
    return MODE_DRAG;
  }

  function updatePos() {
    const left = (start * 100).toFixed(2) + '%';
    const right = ((1 - end) * 100).toFixed(2) + '%';
    handle.style.left = left;
    handle.style.right = right;
    handle.previousElementSibling.style.width = left;
    handle.nextElementSibling.style.width = right;
  }

  function selectStart(event) {
    event.preventDefault();
  }

  function getEventPageX(event) {
    return (event.touches ? event.touches[0].pageX : event.pageX) - window.scrollX;
  }

  return {
    isActive() {
      return !!dragMode;
    },
    update(s, e) {
      start = s;
      end = e;
      updatePos();
    },
  };
}

function ChartLegend(container, { app, chartData, columnDisabled, onToggle }) {
  if (chartData.columns.length < 3) {
    return;
  }

  const items = {};

  const isTouch = 'ontouchstart' in window;

  let longTapTimeout;
  let longTap = false;

  const frag = document.createDocumentFragment();
  for (const column of chartData.columns) {
    const label = column[0];
    if (chartData.types[label] !== 'x') {
      const name = chartData.names[label];
      let color = chartData.colors[label];
      if (app.state.night) {
        color = Color.getColumnNightColor(color);
      }
      const el = buildItemEl(label, name, color);
      frag.append(el);
      items[label] = el;
      el.addEventListener('click', onItemClick);
      if (!isColumnSelected(label)) {
        el.classList.add('chart_legend_item_unselected');
      }
      if (!chartData.percentage) {
        el.addEventListener(isTouch ? 'touchstart' : 'mousedown', onMouseDown);
      }
    }
  }

  container.append(frag);

  app.addEventListener('theme_switch', () => {
    for (const label of Object.keys(items)) {
      let color = chartData.colors[label];
      if (app.state.night) {
        color = Color.getColumnNightColor(color);
      }
      const item = items[label];
      item.style.color = color;
    }
  });

  function onItemClick(event) {
    if (longTap) {
      longTap = false;
      return;
    }
    const item = event.currentTarget;
    const label = item.dataset.label;
    const selectedCount = getSelectedLabelsCount();
    if (isColumnSelected(label) && selectedCount === 1) {
      item.classList.add('_shake');
      item.addEventListener('animationend', () => {
        item.classList.remove('_shake');
      });
      return;
    }
    columnDisabled[label] = item.classList.toggle('chart_legend_item_unselected');
    onToggle([label]);
  }

  function onMouseDown(event) {
    if (event.button) {
      return;
    }
    const item = event.currentTarget;
    const label = item.dataset.label;
    window.addEventListener(isTouch ? 'touchend' : 'mouseup', onMouseUp);
    longTapTimeout = setTimeout(() => {
      onLongTap(label);
    }, 500);
  }

  function onMouseUp() {
    clearTimeout(longTapTimeout);
    window.removeEventListener(isTouch ? 'touchend' : 'mouseup', onMouseUp);
    setTimeout(() => {
      longTap = false;
    }, 10);
  }

  function onLongTap(label) {
    longTap = true;
    const reverseMode = isColumnSelected(label) && getSelectedLabelsCount() === 1;
    const changed = [];
    for (const key of Object.keys(items)) {
      const value = reverseMode ? key !== label : key === label;
      if (isColumnSelected(key) !== value) {
        items[key].classList.toggle('chart_legend_item_unselected', !value);
        columnDisabled[key] = !value;
        changed.push(key);
      }
    }
    onToggle(changed);
  }

  function update() {
    for (const label of Object.keys(columnDisabled)) {
      const el = items[label];
      el.style.transition = 'none';
      el.classList.toggle('chart_legend_item_unselected', !isColumnSelected(label));
      setTimeout(() => {
        el.style.transition = '';
      });
    }
  }

  function buildItemEl(label, name, color) {
    const html = `<div class="chart_legend_item" data-label="${label}" style="color:${color};"><span class="chart_legend_item_name">${name}</span></div>`;
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.firstChild;
  }

  function isColumnSelected(label) {
    return !columnDisabled[label];
  }

  function getSelectedLabelsCount() {
    let count = 0;
    for (const column of chartData.columns) {
      const label = column[0];
      if (label !== 'x' && isColumnSelected(label)) {
        count++;
      }
    }
    return count;
  }

  return {
    update
  };
}


function getColumnNightColor(columnColor, satRatio = 0.75) {
  const hsl = rgb2hsl(hex2rgb(columnColor));
  hsl[1] *= satRatio;
  return rgb2hex(hsl2rgb(hsl));
}

function blendHexColors(background, overlay, alpha) {
  return rgb2hex(blendRgbColors(hex2rgb(background), hex2rgb(overlay), alpha));
}

function blendRgbColors(background, overlay, alpha) {
  return [
    Math.round(overlay[0] * alpha + background[0] * (1 - alpha)),
    Math.round(overlay[1] * alpha + background[1] * (1 - alpha)),
    Math.round(overlay[2] * alpha + background[2] * (1 - alpha))
  ];
}

function hex2rgb(hex) {
  return [
    parseInt(hex.substr(1, 2), 16),
    parseInt(hex.substr(3, 2), 16),
    parseInt(hex.substr(5, 2), 16),
  ];
}

function rgb2hex(color) {
  let result = '#';
  for (const channel of color) {
    result += channel.toString(16).padStart(2, '0');
  }
  return result;
}


function rgb2hsl(rgb) {
  const r = rgb[0] / 255;
  const g = rgb[1] / 255;
  const b = rgb[2] / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  let l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return [h, s, l];
}

function hsl2rgb(hsl) {
  const [h, s, l] = hsl;

  let r = 0;
  let g = 0;
  let b = 0;

  const hue2rgb = (p, q, t) => {
    if (t < 0) {
      t += 1;
    }
    if (t > 1) {
      t -= 1;
    }
    if (t < 1 / 6) {
      return p + (q - p) * 6 * t;
    }
    if (t < 1 / 2) {
      return q;
    }
    if (t < 2 / 3) {
      return p + (q - p) * (2 / 3 - t) * 6;
    }
    return p;
  };

  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}
