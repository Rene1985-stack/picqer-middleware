/**
 * Batch Charts JavaScript for Picqer Middleware
 * This file provides chart visualization for batch data
 */

// Batch Charts class
class BatchCharts {
  constructor() {
    // Initialize charts when DOM is loaded
    this.initCharts();
  }
  
  // Initialize charts
  initCharts() {
    // Check if chart containers exist
    const batchStatusChartContainer = document.getElementById('batch-status-chart');
    const batchProductivityChartContainer = document.getElementById('batch-productivity-chart');
    
    // Create charts if containers exist
    if (batchStatusChartContainer) {
      this.createBatchStatusChart(batchStatusChartContainer);
    }
    
    if (batchProductivityChartContainer) {
      this.createBatchProductivityChart(batchProductivityChartContainer);
    }
  }
  
  // Create batch status chart
  createBatchStatusChart(container) {
    // Create a simple canvas-based chart
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 200;
    container.appendChild(canvas);
    
    // Get canvas context
    const ctx = canvas.getContext('2d');
    
    // Sample data - in a real implementation, this would come from the API
    const data = {
      new: 5,
      in_progress: 8,
      completed: 12,
      cancelled: 3
    };
    
    // Colors for each status
    const colors = {
      new: '#4CAF50',
      in_progress: '#2196F3',
      completed: '#9C27B0',
      cancelled: '#F44336'
    };
    
    // Calculate total
    const total = Object.values(data).reduce((sum, value) => sum + value, 0);
    
    // Draw pie chart
    let startAngle = 0;
    
    for (const [status, count] of Object.entries(data)) {
      // Calculate angle
      const angle = (count / total) * 2 * Math.PI;
      
      // Draw slice
      ctx.beginPath();
      ctx.moveTo(150, 100);
      ctx.arc(150, 100, 80, startAngle, startAngle + angle);
      ctx.closePath();
      
      // Fill slice
      ctx.fillStyle = colors[status];
      ctx.fill();
      
      // Update start angle
      startAngle += angle;
    }
    
    // Draw legend
    let legendY = 20;
    
    for (const [status, count] of Object.entries(data)) {
      // Draw color box
      ctx.fillStyle = colors[status];
      ctx.fillRect(220, legendY, 15, 15);
      
      // Draw text
      ctx.fillStyle = '#000000';
      ctx.font = '12px Arial';
      ctx.fillText(`${status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}: ${count}`, 240, legendY + 12);
      
      // Update Y position
      legendY += 25;
    }
  }
  
  // Create batch productivity chart
  createBatchProductivityChart(container) {
    // Create a simple canvas-based chart
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 200;
    container.appendChild(canvas);
    
    // Get canvas context
    const ctx = canvas.getContext('2d');
    
    // Sample data - in a real implementation, this would come from the API
    const data = [
      { day: 'Mon', count: 12 },
      { day: 'Tue', count: 19 },
      { day: 'Wed', count: 15 },
      { day: 'Thu', count: 22 },
      { day: 'Fri', count: 18 },
      { day: 'Sat', count: 8 },
      { day: 'Sun', count: 5 }
    ];
    
    // Find maximum count for scaling
    const maxCount = Math.max(...data.map(item => item.count));
    
    // Draw axes
    ctx.beginPath();
    ctx.moveTo(50, 20);
    ctx.lineTo(50, 150);
    ctx.lineTo(380, 150);
    ctx.strokeStyle = '#000000';
    ctx.stroke();
    
    // Draw bars
    const barWidth = 40;
    const barSpacing = 10;
    let x = 60;
    
    for (const item of data) {
      // Calculate bar height
      const barHeight = (item.count / maxCount) * 120;
      
      // Draw bar
      ctx.fillStyle = '#2196F3';
      ctx.fillRect(x, 150 - barHeight, barWidth, barHeight);
      
      // Draw day label
      ctx.fillStyle = '#000000';
      ctx.font = '12px Arial';
      ctx.fillText(item.day, x + barWidth / 2 - 10, 170);
      
      // Draw count label
      ctx.fillText(item.count.toString(), x + barWidth / 2 - 5, 145 - barHeight);
      
      // Update X position
      x += barWidth + barSpacing;
    }
    
    // Draw Y-axis labels
    ctx.fillStyle = '#000000';
    ctx.font = '12px Arial';
    ctx.fillText('0', 35, 150);
    ctx.fillText(Math.round(maxCount / 2).toString(), 35, 85);
    ctx.fillText(maxCount.toString(), 35, 20);
    
    // Draw title
    ctx.font = 'bold 14px Arial';
    ctx.fillText('Batches Completed by Day', 120, 15);
  }
  
  // Update charts with new data
  updateCharts(data) {
    // Clear existing charts
    const batchStatusChartContainer = document.getElementById('batch-status-chart');
    const batchProductivityChartContainer = document.getElementById('batch-productivity-chart');
    
    if (batchStatusChartContainer) {
      batchStatusChartContainer.innerHTML = '';
      this.createBatchStatusChart(batchStatusChartContainer);
    }
    
    if (batchProductivityChartContainer) {
      batchProductivityChartContainer.innerHTML = '';
      this.createBatchProductivityChart(batchProductivityChartContainer);
    }
  }
}

// Initialize batch charts when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.batchCharts = new BatchCharts();
});
