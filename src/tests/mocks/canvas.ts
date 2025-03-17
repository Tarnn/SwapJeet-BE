/// <reference types="jest" />

export const createCanvas = jest.fn().mockReturnValue({
  getContext: jest.fn().mockReturnValue({
    fillStyle: '',
    fillRect: jest.fn(),
    font: '',
    fillText: jest.fn(),
    toBuffer: jest.fn().mockReturnValue(Buffer.from('mock-image'))
  })
});

export const loadImage = jest.fn().mockResolvedValue({
  width: 100,
  height: 100
}); 