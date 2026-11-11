Pod::Spec.new do |s|
  s.name = 'MarkovWindowControlsInset'
  s.version = '0.0.1'
  s.summary = 'Keeps app content clear of the iPadOS window controls'
  s.description = s.summary
  s.license = { :type => 'MIT' }
  s.author = 'Markov'
  s.homepage = 'https://markov.outhad.com'
  s.source = { :git => 'https://github.com/tanzil7890/markov.git' }
  s.platforms = { :ios => '15.1' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
end
