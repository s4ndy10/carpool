// Representative photographs licensed by Unsplash, not photographs of individual inventory units.
// https://unsplash.com/license
// Hero: https://images.unsplash.com/photo-1503376780353-7e6692767b70
// SUV: https://images.unsplash.com/photo-1519641471654-76ce0107ad1b
// Sedan: https://images.unsplash.com/photo-1555215695-3004980ad54e
// Coupe: https://images.unsplash.com/photo-1492144534655-ae79c964c9d7
export function vehicleImage(category: string) {
  const type = ['SUV', 'Truck', 'Wagon', 'Hatchback'].includes(category)
    ? 'suv'
    : ['Coupe', 'Convertible'].includes(category) ? 'coupe' : 'sedan';
  return `/carpool-${type}.jpg`;
}
